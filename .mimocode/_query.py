import sqlite3, json
conn = sqlite3.connect(r'C:\Users\Raven\.local\share\mimocode\mimocode.db')
cur = conn.cursor()

# Get user messages from recent calendar sessions (not checkpoint-writer)
important_sessions = [
    'ses_06c57ca67ffeMC75Kzqqe4bGCI',  # Task click issue
    'ses_06cfc057bffeuYAU9dSfB00UWz',  # Drag&drop lost
    'ses_06d2c3c3fffe4pexte3tjEaODU',  # Extra comma in weekday
    'ses_06f58040fffe5WXhICAnvOHb0p',  # Weekly grid design update
    'ses_06f914fc5ffeWAmnPZELscmtLl',  # Timeline customization
    'ses_06f99a78fffecFyS3A85xrWm1L',  # Finding weekly components
    'ses_06ff9f59dffe62yM4gFA7F6GDS',  # Exploring codebase
    'ses_070f0222fffeiKgUWVjjnLdqQ0',  # Telegram and phone
    'ses_071adb81fffe5lwgL6itB6bKaW',  # VPN module
    'ses_072635666ffe88BSLwpIm90nOZ',  # Graph connections
    'ses_075c351d4ffeiUQzAkq4xAMhXE',  # Delete SVG
    'ses_077976c16ffe1XF3a9U5g1kBIP',  # Calendar-data.json reliability
    'ses_07a08c528ffe5tmsZYJ6u4Xteb',  # Finance bugs
    'ses_07a65469dffeKOuvn7O9JykKCH',  # Finance reset on restart
    'ses_07aa7aeb7ffefqg6EzACL1uf07',  # calendar-data.json fix
    'ses_07b02872dffeQBpSnKt8aZwD25',  # Finance save bug
    'ses_07b2ecf76ffeh4bEX51JipLkDj',  # Dosier rename
    'ses_07bd3aa5cffesKticR91JTqUps',  # Auto Distill
    'ses_07ce3c015ffe8ViTMw1XWPTnfk',  # dot-container, modal, birthday color
]

# Get user messages from these sessions
for sid in important_sessions:
    cur.execute("""SELECT json_extract(p.data, '$.type') as ptype, 
                   json_extract(p.data, '$.text') as text
                   FROM message m
                   JOIN part p ON p.message_id = m.id
                   WHERE m.session_id = ? AND json_extract(m.data, '$.role') = 'user'
                   AND json_extract(p.data, '$.type') = 'text'
                   ORDER BY m.time_created LIMIT 3""", (sid,))
    rows = cur.fetchall()
    if rows:
        print(f"\n=== {sid} ===")
        for ptype, text in rows:
            if text:
                print(f"  USER: {text[:200]}")

conn.close()
