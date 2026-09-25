"""Export only published syllabus content, never personal progress or raw PDF."""
import hashlib
import json
import sqlite3
import sys
from pathlib import Path


def export(source, target):
    connection = sqlite3.connect(Path(source).resolve().as_uri() + '?mode=ro', uri=True)
    connection.row_factory = sqlite3.Row
    try:
        digest = hashlib.sha256()
        for row in connection.execute('SELECT source_position,normalized_word FROM SourceEntries ORDER BY source_position'):
            digest.update(f"{row['source_position']}:{row['normalized_word']}\n".encode())
        words = [dict(r) for r in connection.execute('SELECT id,word,normalized_word,chinese,details,source_entry_id,source_page,added_date,volume_id FROM Words ORDER BY id')]
        for word in words:
            word['roots'] = [dict(r) for r in connection.execute('SELECT r.*,wr.matched_text FROM Roots r JOIN WordRoots wr ON r.id=wr.root_id WHERE wr.word_id=? ORDER BY r.kind,r.root', (word['id'],))]
        content = {'source_signature': digest.hexdigest(), 'words': words,
                   'roots': [dict(r) for r in connection.execute('SELECT * FROM Roots ORDER BY root')],
                   'volumes': [dict(r) for r in connection.execute('SELECT * FROM Volumes ORDER BY sequence_number')]}
        Path(target).parent.mkdir(parents=True, exist_ok=True)
        Path(target).write_text(json.dumps(content, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        return content
    finally:
        connection.close()


if __name__ == '__main__':
    source = sys.argv[1]
    target = sys.argv[2] if len(sys.argv)>2 else Path(__file__).resolve().parents[1]/'public'/'content.json'
    result = export(source, target)
    print(f"Exported {len(result['words'])} published words; no personal progress.")
