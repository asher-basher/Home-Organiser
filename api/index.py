import os
import sys
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _db import get_conn, query, query_one, execute, init_db

app = Flask(__name__)

STATUSES = ['Keep', 'Sell', 'Listed', 'Sold', 'Donated', 'Trash']

_db_initialized = False
_db_error = None

@app.before_request
def ensure_db():
    global _db_initialized, _db_error
    if not _db_initialized:
        try:
            conn = get_conn()
            init_db(conn)
            conn.close()
            _db_initialized = True
        except Exception as e:
            _db_error = str(e)
            raise


@app.route('/api/health', methods=['GET'])
def health():
    from _db import POSTGRES_URL
    info = {
        'db_type': 'postgres' if POSTGRES_URL else 'sqlite',
        'postgres_url_set': bool(POSTGRES_URL),
        'db_initialized': _db_initialized,
        'error': _db_error,
    }
    if _db_initialized:
        try:
            conn = get_conn()
            rooms = query(conn, "SELECT COUNT(*) as c FROM room")
            items = query(conn, "SELECT COUNT(*) as c FROM item")
            conn.close()
            info['rooms_count'] = rooms[0]['c']
            info['items_count'] = items[0]['c']
        except Exception as e:
            info['query_error'] = str(e)
    return jsonify(info)


@app.route('/api/rooms', methods=['GET'])
def list_rooms():
    conn = get_conn()
    rooms = query(conn, """
        SELECT room.*, COUNT(item.id) as item_count
        FROM room LEFT JOIN item ON room.id = item.room_id
        GROUP BY room.id, room.name ORDER BY room.name
    """)
    conn.close()
    return jsonify(rooms)


@app.route('/api/rooms', methods=['POST'])
def create_room():
    data = request.json
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Name is required'}), 400
    conn = get_conn()
    try:
        room_id = execute(conn, "INSERT INTO room (name) VALUES (?)", (name,))
        conn.commit()
        conn.close()
        return jsonify({'id': room_id}), 201
    except Exception:
        conn.close()
        return jsonify({'error': 'Room already exists'}), 409


@app.route('/api/rooms/<int:room_id>', methods=['DELETE'])
def delete_room(room_id):
    conn = get_conn()
    execute(conn, "DELETE FROM room WHERE id = ?", (room_id,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/items', methods=['GET'])
def list_items():
    conn = get_conn()
    sql = """
        SELECT item.id, item.name, item.room_id, item.notes, item.status,
               item.estimated_value, item.sold_price, item.thumbnail,
               item.created_at, item.updated_at,
               room.name as room_name
        FROM item
        LEFT JOIN room ON item.room_id = room.id
        WHERE 1=1
    """
    params = []

    q = request.args.get('q', '').strip()
    if q:
        sql += " AND (item.name LIKE ? OR item.notes LIKE ?)"
        params += [f'%{q}%', f'%{q}%']

    room_id = request.args.get('room')
    if room_id:
        sql += " AND item.room_id = ?"
        params.append(int(room_id))

    status = request.args.get('status')
    if status:
        sql += " AND item.status = ?"
        params.append(status)

    sort = request.args.get('sort', 'newest')
    sort_map = {
        'newest': 'item.created_at DESC',
        'oldest': 'item.created_at ASC',
        'name': 'item.name ASC',
        'price': 'item.estimated_value DESC',
    }
    sql += f" ORDER BY {sort_map.get(sort, 'item.created_at DESC')}"

    items = query(conn, sql, params)
    conn.close()
    return jsonify(items)


@app.route('/api/items', methods=['POST'])
def create_item():
    data = request.json
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Name is required'}), 400

    conn = get_conn()
    item_id = execute(conn, """
        INSERT INTO item (name, room_id, notes, status, estimated_value, sold_price, photo, thumbnail)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        name,
        data.get('room_id') or None,
        data.get('notes', ''),
        data.get('status', 'Keep'),
        float(data.get('estimated_value') or 0),
        float(data.get('sold_price') or 0),
        data.get('photo', ''),
        data.get('thumbnail', ''),
    ))
    conn.commit()
    conn.close()
    return jsonify({'id': item_id}), 201


@app.route('/api/items/<int:item_id>', methods=['GET'])
def get_item(item_id):
    conn = get_conn()
    item = query_one(conn, """
        SELECT item.*, room.name as room_name
        FROM item LEFT JOIN room ON item.room_id = room.id
        WHERE item.id = ?
    """, (item_id,))
    conn.close()
    if not item:
        return jsonify({'error': 'Not found'}), 404
    return jsonify(item)


@app.route('/api/items/<int:item_id>', methods=['PUT'])
def update_item(item_id):
    data = request.json
    conn = get_conn()
    execute(conn, """
        UPDATE item SET name=?, room_id=?, notes=?, status=?,
        estimated_value=?, sold_price=?, photo=?, thumbnail=?,
        updated_at=? WHERE id=?
    """, (
        data['name'],
        data.get('room_id') or None,
        data.get('notes', ''),
        data.get('status', 'Keep'),
        float(data.get('estimated_value') or 0),
        float(data.get('sold_price') or 0),
        data.get('photo', ''),
        data.get('thumbnail', ''),
        datetime.now().isoformat(),
        item_id,
    ))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/items/<int:item_id>', methods=['DELETE'])
def delete_item(item_id):
    conn = get_conn()
    execute(conn, "DELETE FROM item WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/items/<int:item_id>/status', methods=['PATCH'])
def update_status(item_id):
    data = request.json
    new_status = data.get('status')
    if new_status not in STATUSES:
        return jsonify({'error': 'Invalid status'}), 400
    conn = get_conn()
    execute(conn, "UPDATE item SET status=?, updated_at=? WHERE id=?",
            (new_status, datetime.now().isoformat(), item_id))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/stats', methods=['GET'])
def stats():
    conn = get_conn()
    total = query_one(conn, "SELECT COUNT(*) as count FROM item")['count']
    by_status = query(conn, "SELECT status, COUNT(*) as count FROM item GROUP BY status")
    total_value = query_one(conn,
        "SELECT COALESCE(SUM(estimated_value), 0) as total FROM item WHERE status IN ('Sell','Listed')"
    )['total']
    total_sold = query_one(conn,
        "SELECT COALESCE(SUM(sold_price), 0) as total FROM item WHERE status = 'Sold'"
    )['total']
    conn.close()
    return jsonify({
        'total': total,
        'by_status': by_status,
        'total_value': float(total_value),
        'total_sold': float(total_sold),
    })


if __name__ == '__main__':
    public_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public')

    @app.route('/', defaults={'path': 'index.html'})
    @app.route('/<path:path>')
    def serve_static(path):
        return send_from_directory(public_dir, path)

    conn = get_conn()
    init_db(conn)
    conn.close()
    app.run(debug=True, port=5000)
