import streamlit as st
import google.generativeai as genai

st.set_page_config(page_title="העוזר האישי שלי", direction="rtl")

st.title("🤖 העוזר החכם שלי")

# בדיקה שיש מפתח
if "GOOGLE_API_KEY" not in st.secrets:
    st.error("חסר מפתח API. נא להגדיר ב-Streamlit Secrets.")
    st.stop()

# הגדרת המודל
genai.configure(api_key=st.secrets["GOOGLE_API_KEY"])
model = genai.GenerativeModel('gemini-1.5-flash')

# שמירת היסטוריה
if "messages" not in st.session_state:
    st.session_state.messages = []

# הצגת הודעות קודמות
for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.write(message["content"])

# קלט מהמשתמש
if prompt := st.chat_input("כתוב כאן הודעה..."):
    # הצגת הודעת המשתמש
    with st.chat_message("user"):
        st.write(prompt)
    st.session_state.messages.append({"role": "user", "content": prompt})

    # קבלת תשובה
    with st.chat_message("assistant"):
        with st.spinner("חושב..."):
            try:
                response = model.generate_content(prompt)
                st.write(response.text)
                st.session_state.messages.append({"role": "model", "content": response.text})
            except Exception as e:
                st.error(f"שגיאה: {e}") 
