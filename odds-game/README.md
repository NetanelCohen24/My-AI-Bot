# 🎲 מה הסיכויים? — מולטיפלייר בזמן אמת

משחק חברתי למובייל: כל אחד מהטלפון שלו, נכנסים עם קוד חדר בן 4 תווים.
קובץ אחד (`index.html`), בלי שרת ובלי build.

## הרצה מיידית (מצב סימולציה)
פותחים את `index.html` בדפדפן. כל עוד `databaseURL` ריק, המשחק רץ במצב סימולציה:
- צור חדר ← "🤖 הוסף בוט לבדיקה" ← התחל. הבוטים כותבים אתגרים, בוחרים מספרים ומצביעים.
- אפשר גם לפתוח כמה לשוניות באותו דפדפן — כל לשונית היא שחקן נפרד.
- `index.html?sim` מכריח מצב סימולציה גם כשיש מפתחות.

## חיבור Firebase והעלאה לאוויר (4 צעדים)
1. **פרויקט חינמי:** https://console.firebase.google.com ← Add project ← שם כלשהו (אפשר לכבות Analytics).
2. **Realtime Database:** Build ← Realtime Database ← Create Database ← אזור (למשל `europe-west1`) ← **Start in test mode**.
3. **מפתחות:** ⚙️ Project settings ← General ← Your apps ← `</>` ← רושמים אפליקציה ← מעתיקים את `firebaseConfig`
   ומדביקים בראש `index.html` (בבלוק המסומן 🔥). ודא שהשדה `databaseURL` מלא.
4. **לאוויר:** גוררים את התיקייה `odds-game` ל-https://app.netlify.com/drop ← מקבלים לינק https ← שולחים בוואטסאפ.
   (עובד גם עם Vercel או GitHub Pages.)

> Test mode מאפשר קריאה/כתיבה לכולם ל-30 יום. אחרי זה מאריכים את התאריך בלשונית **Rules**.
> מפתחות ה-Web של Firebase אינם סודיים, אבל כדאי למחוק את החדרים הישנים מדי פעם מה-Console.

## מבנה הנתונים
```
rooms/{CODE}   phase, round, settings, asker, doer, challenge, picks, votes, players{...}
proofs/{CODE}  תמונת ההוכחה של הסיבוב (JPEG מוקטן, ~100KB)
```
שלבים: `lobby → challenge → picking → countdown → reveal → (voting → scored) → … → final`.
כל מעבר שלב נעשה ב-transaction, כך ששני טלפונים שלוחצים באותו רגע לא דורסים זה את זה.
הספירה לאחור מסונכרנת לפי שעון השרת של Firebase (`serverTimeOffset`).
אם מנהל החדר מתנתק, השחקן הבא שהצטרף מקבל את הכתר 👑 אוטומטית.
