# Discord Safe Starter (Compliant)
**لا يحتوي على أي خصائص لبيع أعضاء أو إدخال قسري**. يشمل:
- تحقق OAuth2 (يعطي دور VERIFIED للموجودين بالسيرفر)
- بانل /setup لزر التحقق + فتح تذكرة
- نظام تذاكر بسيط مع مودال شراء "دور"
- أمر /tax لحسبة الضريبة

## الإعداد
1) `cp .env.example .env` ثم عبه بالمتغيرات:
   - DISCORD_TOKEN: توكن البوت
   - CLIENT_ID, CLIENT_SECRET: من تطبيق ديسكورد
   - GUILD_ID: السيرفر المستهدف
   - VERIFIED_ROLE_ID: الدور الذي يعطى بعد التحقق
   - OWNER_IDS: آي ديّات الملاك مفصولة بفواصل
   - CATEGORY_ID: كاتيجوري فتح التذاكر
   - WEBSITE_PORT, WEBSITE_BASE_URL: منفذ وعنوان الموقع (يجب يطابق Callback)
2) `npm i`
3) عدّل OAuth2 Redirects في بوابة ديسكورد إلى: `http://localhost:3000/auth/callback`
4) شغل: `npm run start`

## ملاحظات
- الإضافة الوحيدة بعد الدفع هي إعطاء "دور" يدويًا بعد التأكد (لا يوجد إدخال قسري لأعضاء).
- احرص على الالتزام بقوانين ديسكورد دائمًا.
