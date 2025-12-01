import streamlit as st
from google import genai  # אם אתה משתמש בזה

# הגדרת כותרת הדף (בלי direction)
st.set_page_config(
    page_title="העוזר האישי שלי",
    layout="wide"  # אפשרות להצגה רחבה
)

# CSS מותאם ל-RTL
st.markdown(
    """
    <style>
    /* העמוד כולו מימין לשמאל */
    html, body, [class*="css"] {
        direction: rtl;
        text-align: right;
    }

    /* כותרות */
    .stHeader h1, .stHeader h2, .stHeader h3, .stHeader h4, .stHeader h5 {
        text-align: right;
    }

    /* טקסטים רגילים */
    .stText, .stMarkdown p {
        text-align: right;
    }

    /* כפתורים */
    button[kind="primary"], button[kind="secondary"] {
        direction: rtl;
    }

    /* קלטים */
    input, textarea, select {
        direction: rtl;
        text-align: right;
    }
    </style>
    """,
    unsafe_allow_html=True
)

# כותרת ראשית
st.title("🤖 העוזר החכם שלי")

# תיבת קלט לדוגמה
user_input = st.text_input("כתוב כאן את השאלה שלך:")

# כפתור לשליחה
if st.button("שלח"):
    if user_input:
        # כאן תוכל לקרוא ל-GenAI או כל לוגיקה אחרת
        st.success(f"השאלה שלך: {user_input} נשלחה בהצלחה!")
    else:
        st.warning("אנא כתוב שאלה לפני השליחה.")

# תיבת טקסט להצגת פלט לדוגמה
st.text_area("תשובות:", "כאן יופיעו התשובות של העוזר שלך...")
