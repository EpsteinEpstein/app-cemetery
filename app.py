import os
import random
import sqlite3
from datetime import datetime
from flask import Flask, render_template, request, jsonify, g, send_from_directory

app = Flask(__name__)
DB_PATH = os.path.join(os.path.dirname(__file__), "cemetery.db")
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "static", "uploads")
ALLOWED_EXT = {"png", "jpg", "jpeg", "gif", "webp"}

os.makedirs(UPLOAD_DIR, exist_ok=True)


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(exception):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS graves (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            icon TEXT,
            installed TEXT,
            deleted TEXT,
            cause TEXT,
            last_words TEXT,
            note TEXT,
            category TEXT,
            memory TEXT,
            photo TEXT,
            rating INTEGER DEFAULT 0,
            tags TEXT DEFAULT '',
            favorite INTEGER DEFAULT 0,
            visits INTEGER DEFAULT 0,
            resurrected INTEGER DEFAULT 0,
            resurrect_count INTEGER DEFAULT 0,
            resurrected_date TEXT,
            last_viewed TEXT,
            created_at TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            grave_id INTEGER NOT NULL,
            text TEXT NOT NULL,
            created_at TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            created_at TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS achievements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT UNIQUE NOT NULL,
            unlocked_at TEXT
        )
    """)

    existing = [r[1] for r in conn.execute("PRAGMA table_info(graves)").fetchall()]
    for col, definition in [
        ("photo", "TEXT"),
        ("rating", "INTEGER DEFAULT 0"),
        ("tags", "TEXT DEFAULT ''"),
        ("favorite", "INTEGER DEFAULT 0"),
        ("visits", "INTEGER DEFAULT 0"),
        ("last_viewed", "TEXT")
    ]:
        if col not in existing:
            conn.execute(f"ALTER TABLE graves ADD COLUMN {col} {definition}")

    conn.commit()
    conn.close()


def compute_age(installed, deleted):
    try:
        d1 = datetime.strptime(installed, "%Y-%m-%d")
        d2 = datetime.strptime(deleted, "%Y-%m-%d")
    except (ValueError, TypeError):
        return "Unknown"

    if d2 < d1:
        d1, d2 = d2, d1

    years = d2.year - d1.year
    months = d2.month - d1.month
    days = d2.day - d1.day

    if days < 0:
        months -= 1
        days += 30
    if months < 0:
        years -= 1
        months += 12

    parts = []
    if years > 0:
        parts.append(f"{years} year{'s' if years != 1 else ''}")
    if months > 0:
        parts.append(f"{months} month{'s' if months != 1 else ''}")
    if not parts:
        parts.append(f"{days} day{'s' if days != 1 else ''}")
    return ", ".join(parts)


def age_in_days(installed, deleted):
    try:
        d1 = datetime.strptime(installed, "%Y-%m-%d")
        d2 = datetime.strptime(deleted, "%Y-%m-%d")
        return abs((d2 - d1).days)
    except (ValueError, TypeError):
        return 0


def days_since(date_str):
    try:
        d = datetime.strptime(date_str, "%Y-%m-%d")
        return (datetime.now() - d).days
    except (ValueError, TypeError):
        return 0


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXT


ACHIEVEMENTS = [
    {"key": "first_burial", "name": "first burial", "desc": "bury your first app"},
    {"key": "ten_buried", "name": "serial uninstaller", "desc": "bury 10 apps"},
    {"key": "fifty_buried", "name": "graveyard keeper", "desc": "bury 50 apps"},
    {"key": "first_resurrect", "name": "resurrector", "desc": "resurrect an app"},
    {"key": "repeat_offender", "name": "repeat offender", "desc": "resurrect an app 3 times"},
    {"key": "ancient_one", "name": "ancient one", "desc": "bury an app that lived 5+ years"},
    {"key": "short_lived", "name": "short lived", "desc": "bury an app that lived less than a day"},
    {"key": "tag_master", "name": "tag master", "desc": "add tags to 5 graves"},
    {"key": "mourner", "name": "mourner", "desc": "give 5 graves a 5-skull rating"},
    {"key": "five_favorites", "name": "keeper", "desc": "mark 5 graves as favorites"}
]


def check_achievements():
    db = get_db()
    graves = db.execute("SELECT * FROM graves").fetchall()
    unlocked = set()

    total = len([g for g in graves if not g["resurrected"]])
    resurrected_count = len([g for g in graves if g["resurrected"]])
    max_resurrect = max([g["resurrect_count"] or 0 for g in graves], default=0)
    tagged = len([g for g in graves if g["tags"] and g["tags"].strip()])
    five_skulls = len([g for g in graves if (g["rating"] or 0) == 5])
    favorites = len([g for g in graves if g["favorite"]])

    for g in graves:
        days = age_in_days(g["installed"], g["deleted"])
        if days >= 365 * 5:
            unlocked.add("ancient_one")
        if 0 < days < 1:
            unlocked.add("short_lived")

    if total >= 1:
        unlocked.add("first_burial")
    if total >= 10:
        unlocked.add("ten_buried")
    if total >= 50:
        unlocked.add("fifty_buried")
    if resurrected_count >= 1:
        unlocked.add("first_resurrect")
    if max_resurrect >= 3:
        unlocked.add("repeat_offender")
    if tagged >= 5:
        unlocked.add("tag_master")
    if five_skulls >= 5:
        unlocked.add("mourner")
    if favorites >= 5:
        unlocked.add("five_favorites")

    for key in unlocked:
        existing = db.execute(
            "SELECT id FROM achievements WHERE key = ?", (key,)
        ).fetchone()
        if not existing:
            db.execute(
                "INSERT INTO achievements (key, unlocked_at) VALUES (?, ?)",
                (key, datetime.now().isoformat())
            )
    db.commit()


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/graves", methods=["GET"])
def list_graves():
    db = get_db()
    rows = db.execute(
        "SELECT * FROM graves WHERE resurrected = 0 ORDER BY favorite DESC, deleted DESC"
    ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/graves", methods=["POST"])
def add_grave():
    data = request.get_json() or {}
    db = get_db()
    db.execute("""
        INSERT INTO graves
        (name, icon, installed, deleted, cause, last_words, note,
         category, memory, rating, tags, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        data.get("name", "Unknown App"),
        data.get("icon", ""),
        data.get("installed", ""),
        data.get("deleted", ""),
        data.get("cause", ""),
        data.get("last_words", ""),
        data.get("note", ""),
        data.get("category", "Other"),
        data.get("memory", ""),
        int(data.get("rating", 0) or 0),
        data.get("tags", ""),
        datetime.now().isoformat()
    ))
    db.commit()
    check_achievements()
    return jsonify({"status": "ok"}), 201


@app.route("/api/graves/<int:grave_id>", methods=["GET"])
def get_grave(grave_id):
    db = get_db()
    row = db.execute("SELECT * FROM graves WHERE id = ?", (grave_id,)).fetchone()
    if not row:
        return jsonify({"error": "not found"}), 404

    db.execute("""
        UPDATE graves
        SET last_viewed = ?, visits = COALESCE(visits, 0) + 1
        WHERE id = ?
    """, (datetime.now().strftime("%Y-%m-%d"), grave_id))
    db.commit()

    row = db.execute("SELECT * FROM graves WHERE id = ?", (grave_id,)).fetchone()
    data = dict(row)
    data["age"] = compute_age(data["installed"], data["deleted"])
    data["days_since"] = days_since(data["deleted"])
    return jsonify(data)


@app.route("/api/graves/<int:grave_id>", methods=["DELETE"])
def delete_grave(grave_id):
    db = get_db()
    row = db.execute("SELECT photo FROM graves WHERE id = ?", (grave_id,)).fetchone()
    if row and row["photo"]:
        try:
            os.remove(os.path.join(UPLOAD_DIR, row["photo"]))
        except OSError:
            pass
    db.execute("DELETE FROM notes WHERE grave_id = ?", (grave_id,))
    db.execute("DELETE FROM graves WHERE id = ?", (grave_id,))
    db.commit()
    return jsonify({"status": "deleted"})


@app.route("/api/graves/<int:grave_id>/favorite", methods=["POST"])
def toggle_favorite(grave_id):
    db = get_db()
    row = db.execute("SELECT favorite FROM graves WHERE id = ?", (grave_id,)).fetchone()
    if not row:
        return jsonify({"error": "not found"}), 404
    new_val = 0 if row["favorite"] else 1
    db.execute("UPDATE graves SET favorite = ? WHERE id = ?", (new_val, grave_id))
    db.commit()
    check_achievements()
    return jsonify({"favorite": new_val})


@app.route("/api/graves/<int:grave_id>/resurrect", methods=["POST"])
def resurrect_grave(grave_id):
    db = get_db()
    row = db.execute("SELECT * FROM graves WHERE id = ?", (grave_id,)).fetchone()
    if not row:
        return jsonify({"error": "not found"}), 404
    count = (row["resurrect_count"] or 0) + 1
    db.execute("""
        UPDATE graves
        SET resurrected = 1,
            resurrect_count = ?,
            resurrected_date = ?
        WHERE id = ?
    """, (count, datetime.now().strftime("%Y-%m-%d"), grave_id))
    db.commit()
    check_achievements()
    return jsonify({"status": "resurrected", "count": count})


@app.route("/api/graves/<int:grave_id>/photo", methods=["POST"])
def upload_photo(grave_id):
    if "photo" not in request.files:
        return jsonify({"error": "no file"}), 400
    file = request.files["photo"]
    if not file or not file.filename:
        return jsonify({"error": "empty filename"}), 400
    if not allowed_file(file.filename):
        return jsonify({"error": "invalid file type"}), 400

    db = get_db()
    row = db.execute("SELECT photo FROM graves WHERE id = ?", (grave_id,)).fetchone()
    if not row:
        return jsonify({"error": "not found"}), 404

    if row["photo"]:
        try:
            os.remove(os.path.join(UPLOAD_DIR, row["photo"]))
        except OSError:
            pass

    ext = file.filename.rsplit(".", 1)[1].lower()
    filename = f"grave_{grave_id}_{int(datetime.now().timestamp())}.{ext}"
    file.save(os.path.join(UPLOAD_DIR, filename))

    db.execute("UPDATE graves SET photo = ? WHERE id = ?", (filename, grave_id))
    db.commit()
    return jsonify({"status": "ok", "photo": filename})


@app.route("/api/graves/<int:grave_id>/notes", methods=["GET"])
def list_notes(grave_id):
    db = get_db()
    rows = db.execute(
        "SELECT * FROM notes WHERE grave_id = ? ORDER BY created_at DESC",
        (grave_id,)
    ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/graves/<int:grave_id>/notes", methods=["POST"])
def add_note(grave_id):
    data = request.get_json() or {}
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "empty note"}), 400
    db = get_db()
    db.execute("""
        INSERT INTO notes (grave_id, text, created_at)
        VALUES (?, ?, ?)
    """, (grave_id, text, datetime.now().isoformat()))
    db.commit()
    return jsonify({"status": "ok"}), 201


@app.route("/api/notes/<int:note_id>", methods=["DELETE"])
def delete_note(note_id):
    db = get_db()
    db.execute("DELETE FROM notes WHERE id = ?", (note_id,))
    db.commit()
    return jsonify({"status": "deleted"})


@app.route("/api/categories", methods=["GET"])
def list_categories():
    db = get_db()
    rows = db.execute("SELECT name FROM categories ORDER BY name ASC").fetchall()
    return jsonify([r["name"] for r in rows])


@app.route("/api/categories", methods=["POST"])
def add_category():
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "empty name"}), 400
    db = get_db()
    try:
        db.execute(
            "INSERT INTO categories (name, created_at) VALUES (?, ?)",
            (name, datetime.now().isoformat())
        )
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "already exists"}), 409
    return jsonify({"status": "ok", "name": name}), 201


@app.route("/api/resurrected", methods=["GET"])
def list_resurrected():
    db = get_db()
    rows = db.execute(
        "SELECT * FROM graves WHERE resurrected = 1 ORDER BY resurrected_date DESC"
    ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/random", methods=["GET"])
def random_grave():
    db = get_db()
    row = db.execute(
        "SELECT * FROM graves WHERE resurrected = 0 ORDER BY RANDOM() LIMIT 1"
    ).fetchone()
    if not row:
        return jsonify({"error": "cemetery is empty"}), 404
    data = dict(row)
    data["age"] = compute_age(data["installed"], data["deleted"])
    data["days_since"] = days_since(data["deleted"])
    return jsonify(data)


@app.route("/api/flashback", methods=["GET"])
def flashback():
    db = get_db()
    today = datetime.now().strftime("%m-%d")
    row = db.execute("""
        SELECT * FROM graves
        WHERE deleted != ''
          AND substr(deleted, 6) = ?
          AND resurrected = 0
        ORDER BY RANDOM() LIMIT 1
    """, (today,)).fetchone()

    if not row:
        row = db.execute("""
            SELECT * FROM graves WHERE resurrected = 0
            ORDER BY RANDOM() LIMIT 1
        """).fetchone()

    if not row:
        return jsonify({"error": "cemetery is empty"}), 404

    data = dict(row)
    data["age"] = compute_age(data["installed"], data["deleted"])
    data["days_since"] = days_since(data["deleted"])
    data["years_ago"] = max(1, days_since(data["deleted"]) // 365)
    return jsonify(data)


@app.route("/api/stats", methods=["GET"])
def stats():
    db = get_db()
    total = db.execute(
        "SELECT COUNT(*) FROM graves WHERE resurrected = 0"
    ).fetchone()[0]
    this_month = db.execute("""
        SELECT COUNT(*) FROM graves
        WHERE resurrected = 0
          AND strftime('%Y-%m', deleted) = strftime('%Y-%m', 'now')
    """).fetchone()[0]

    common_cause_row = db.execute("""
        SELECT cause, COUNT(*) as c FROM graves
        WHERE resurrected = 0 AND cause != ''
        GROUP BY cause ORDER BY c DESC LIMIT 1
    """).fetchone()
    common_cause = dict(common_cause_row) if common_cause_row else {"cause": "N/A", "c": 0}

    common_cat_row = db.execute("""
        SELECT category, COUNT(*) as c FROM graves
        WHERE resurrected = 0 AND category != ''
        GROUP BY category ORDER BY c DESC LIMIT 1
    """).fetchone()
    common_cat = dict(common_cat_row) if common_cat_row else {"category": "N/A", "c": 0}

    all_graves = db.execute(
        "SELECT * FROM graves WHERE resurrected = 0"
    ).fetchall()

    longest = None
    shortest = None
    longest_days = -1
    shortest_days = 10**9
    for r in all_graves:
        days = age_in_days(r["installed"], r["deleted"])
        if days == 0:
            continue
        if days > longest_days:
            longest_days = days
            longest = {"name": r["name"], "days": days,
                       "age": compute_age(r["installed"], r["deleted"])}
        if days < shortest_days:
            shortest_days = days
            shortest = {"name": r["name"], "days": days,
                        "age": compute_age(r["installed"], r["deleted"])}

    resurrected_count = db.execute(
        "SELECT COUNT(*) FROM graves WHERE resurrected = 1"
    ).fetchone()[0]

    most_resurrected_row = db.execute("""
        SELECT name, resurrect_count FROM graves
        WHERE resurrect_count > 0
        ORDER BY resurrect_count DESC LIMIT 1
    """).fetchone()
    most_resurrected = dict(most_resurrected_row) if most_resurrected_row else None

    health_score = 0
    if total > 0:
        avg_age = sum(age_in_days(g["installed"], g["deleted"]) for g in all_graves) / total
        age_score = min(50, avg_age / 30)
        diversity = len(set(g["category"] for g in all_graves if g["category"]))
        diversity_score = min(30, diversity * 5)
        resurrect_ratio = resurrected_count / (total + resurrected_count) if (total + resurrected_count) > 0 else 0
        resurrect_score = (1 - resurrect_ratio) * 20
        health_score = round(age_score + diversity_score + resurrect_score)

    return jsonify({
        "total": total,
        "this_month": this_month,
        "common_cause": common_cause,
        "common_category": common_cat,
        "longest": longest,
        "shortest": shortest,
        "resurrected_count": resurrected_count,
        "most_resurrected": most_resurrected,
        "health_score": health_score
    })


@app.route("/api/charts/causes", methods=["GET"])
def chart_causes():
    db = get_db()
    rows = db.execute("""
        SELECT cause, COUNT(*) as c FROM graves
        WHERE resurrected = 0 AND cause != ''
        GROUP BY cause ORDER BY c DESC
    """).fetchall()
    return jsonify([{"label": r["cause"], "value": r["c"]} for r in rows])


@app.route("/api/charts/categories", methods=["GET"])
def chart_categories():
    db = get_db()
    rows = db.execute("""
        SELECT category, COUNT(*) as c FROM graves
        WHERE resurrected = 0 AND category != ''
        GROUP BY category ORDER BY c DESC
    """).fetchall()
    return jsonify([{"label": r["category"], "value": r["c"]} for r in rows])


@app.route("/api/timeline", methods=["GET"])
def timeline():
    db = get_db()
    rows = db.execute("""
        SELECT strftime('%Y', deleted) as year, COUNT(*) as c
        FROM graves
        WHERE deleted != '' AND resurrected = 0
        GROUP BY year ORDER BY year ASC
    """).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/achievements", methods=["GET"])
def list_achievements():
    db = get_db()
    unlocked_rows = db.execute(
        "SELECT key, unlocked_at FROM achievements"
    ).fetchall()
    unlocked = {r["key"]: r["unlocked_at"] for r in unlocked_rows}

    result = []
    for a in ACHIEVEMENTS:
        result.append({
            "key": a["key"],
            "name": a["name"],
            "desc": a["desc"],
            "unlocked": a["key"] in unlocked,
            "unlocked_at": unlocked.get(a["key"])
        })
    return jsonify(result)


@app.route("/api/export", methods=["GET"])
def export_data():
    db = get_db()
    graves_rows = db.execute("SELECT * FROM graves").fetchall()
    notes_rows = db.execute("SELECT * FROM notes").fetchall()
    cats_rows = db.execute("SELECT * FROM categories").fetchall()
    data = {
        "version": 2,
        "exported_at": datetime.now().isoformat(),
        "graves": [dict(r) for r in graves_rows],
        "notes": [dict(r) for r in notes_rows],
        "categories": [dict(r) for r in cats_rows]
    }
    return jsonify(data)


@app.route("/api/import", methods=["POST"])
def import_data():
    data = request.get_json() or {}
    graves_list = data.get("graves", [])
    if not graves_list:
        return jsonify({"error": "no graves"}), 400

    db = get_db()
    count = 0
    for g in graves_list:
        db.execute("""
            INSERT INTO graves
            (name, icon, installed, deleted, cause, last_words, note,
             category, memory, photo, rating, tags, favorite, visits,
             resurrected, resurrect_count, resurrected_date,
             last_viewed, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            g.get("name", "Unknown"),
            g.get("icon", ""),
            g.get("installed", ""),
            g.get("deleted", ""),
            g.get("cause", ""),
            g.get("last_words", ""),
            g.get("note", ""),
            g.get("category", "Other"),
            g.get("memory", ""),
            g.get("photo", ""),
            int(g.get("rating", 0) or 0),
            g.get("tags", ""),
            int(g.get("favorite", 0) or 0),
            int(g.get("visits", 0) or 0),
            int(g.get("resurrected", 0) or 0),
            int(g.get("resurrect_count", 0) or 0),
            g.get("resurrected_date", ""),
            g.get("last_viewed", ""),
            g.get("created_at", datetime.now().isoformat())
        ))
        count += 1
    db.commit()
    return jsonify({"status": "ok", "imported": count})


@app.route("/uploads/<filename>")
def serve_upload(filename):
    return send_from_directory(UPLOAD_DIR, filename)


@app.route("/api/epitaph", methods=["GET"])
def epitaph():
    lines = [
        "here lies {name}. it never stopped buzzing.",
        "{name} — gone but not forgotten. mostly forgotten.",
        "rest in peace, {name}. you were uninstalled with love.",
        "{name}: it wasn't you, it was your ads.",
        "here lies {name}. survived by 47 notifications.",
        "{name} — took up space, gave nothing back.",
        "goodbye {name}. we had some good times. some.",
        "{name}: installed with hope, deleted with relief.",
        "in memory of {name}. died doing what it loved: lagging.",
        "{name} — you will be missed. by your cache, maybe."
    ]
    return jsonify({"epitaph": random.choice(lines)})


if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000, debug=True)