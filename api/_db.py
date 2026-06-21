import os

POSTGRES_URL = os.environ.get('POSTGRES_URL', '')


def get_conn():
    if POSTGRES_URL:
        import psycopg2
        url = POSTGRES_URL.replace('postgres://', 'postgresql://', 1)
        return psycopg2.connect(url, sslmode='require')
    else:
        import sqlite3
        if os.environ.get('VERCEL'):
            db_path = '/tmp/inventory.db'
        else:
            db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'inventory.db')
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA journal_mode=WAL")
        return conn


def _adapt(sql):
    if POSTGRES_URL:
        return sql.replace('?', '%s')
    return sql


def query(conn, sql, params=None):
    cur = conn.cursor()
    cur.execute(_adapt(sql), params or ())
    if cur.description is None:
        return []
    cols = [d[0] for d in cur.description]
    rows = cur.fetchall()
    if POSTGRES_URL:
        return [dict(zip(cols, row)) for row in rows]
    else:
        return [dict(row) for row in rows]


def query_one(conn, sql, params=None):
    results = query(conn, sql, params)
    return results[0] if results else None


def execute(conn, sql, params=None):
    cur = conn.cursor()
    if POSTGRES_URL:
        adapted = _adapt(sql)
        if adapted.strip().upper().startswith('INSERT') and 'RETURNING' not in adapted.upper():
            adapted = adapted.rstrip().rstrip(';') + ' RETURNING id'
        cur.execute(adapted, params or ())
        if adapted.strip().upper().startswith('INSERT'):
            row = cur.fetchone()
            return row[0] if row else None
        return None
    else:
        cur.execute(sql, params or ())
        return cur.lastrowid


def init_db(conn):
    cur = conn.cursor()
    if POSTGRES_URL:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS room (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL UNIQUE
            );
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS item (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                room_id INTEGER REFERENCES room(id) ON DELETE SET NULL,
                notes TEXT DEFAULT '',
                status TEXT DEFAULT 'Keep',
                estimated_value NUMERIC(10,2) DEFAULT 0,
                sold_price NUMERIC(10,2) DEFAULT 0,
                photo TEXT DEFAULT '',
                thumbnail TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        """)
    else:
        cur.executescript("""
            CREATE TABLE IF NOT EXISTS room (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE
            );
            CREATE TABLE IF NOT EXISTS item (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                room_id INTEGER REFERENCES room(id) ON DELETE SET NULL,
                notes TEXT DEFAULT '',
                status TEXT DEFAULT 'Keep',
                estimated_value REAL DEFAULT 0,
                sold_price REAL DEFAULT 0,
                photo TEXT DEFAULT '',
                thumbnail TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );
        """)

    # Migration: add priority column
    try:
        if POSTGRES_URL:
            cur.execute("ALTER TABLE item ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'Low'")
        else:
            cur.execute("ALTER TABLE item ADD COLUMN priority TEXT DEFAULT 'Low'")
    except Exception:
        pass

    conn.commit()

    default_rooms = [
        'Living Room', 'Bedroom', 'Kitchen', 'Bathroom',
        'Garage', 'Storage', 'Other'
    ]
    for name in default_rooms:
        try:
            if POSTGRES_URL:
                cur.execute("INSERT INTO room (name) VALUES (%s) ON CONFLICT DO NOTHING", (name,))
            else:
                cur.execute("INSERT OR IGNORE INTO room (name) VALUES (?)", (name,))
        except Exception:
            pass

    conn.commit()
