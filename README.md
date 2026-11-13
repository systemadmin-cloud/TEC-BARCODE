# TEC Gate Scanner

Student barcode gate entry / exit system for Thangavelu Engineering College.

- **Frontend** (static, deploy on Vercel): `index`, `scan` (phone camera), `desk` (USB scanner + reports), `admin`
- **Backend** (Google Apps Script API + Google Sheets): `apps-script/Code.gs`

## 1. Backend setup (once)
1. Open the Google Sheet (must be a native Google Sheet, not .xlsx) with a tab **Combined_Students**, columns A–I:
   `Barcode_ID, Register_No, Student_Name, Gender, Department, Year, Hostel_Status, Institution, Card_Status`
2. **Extensions → Apps Script**. Replace the code with `apps-script/Code.gs`.
   (Project Settings → "Show appsscript.json" → paste `apps-script/appsscript.json`.)
3. Select function **setupSystem** → Run → authorize. Open **Execution log**: copy the printed **API token**.
   (This creates Gate_Logs, Outing_Requests, Staff_Permissions.)
4. **Deploy → New deployment → Web app** · Execute as: **Me** · Who has access: **Anyone** → copy the URL ending in `/exec`.
5. After ANY later change to Code.gs: **Deploy → Manage deployments → Edit → New version**.

## 2. Frontend
Push this folder to GitHub, import in Vercel (no build settings). On each device open **scan** or **desk** → ⚙️ Settings → paste the `/exec` URL + token → Save → Test connection.
(Admin page uses the same URL/token under *Connection*.)

## Behaviour
- **Auto**: first scan of each day = IN, then alternates. **Manual / Only IN / Only OUT** also available per device.
- Repeat scan of same student within 10 s is ignored (server) and within 4 s (browser).
- **Hostel students**: an OUT needs an APPROVED outing request. Scanning without one creates a PENDING request, the admin approves it in *Admin → Hostel Requests*, the scanner shows the approval, and the next scan records OUT. The next IN marks the request RETURNED.
- Inactive cards (Card_Status ≠ ACTIVE) and unknown IDs are rejected and never logged.
- Barcode or register number both work.
- Reports: daily/monthly (desk), filtered export + live dashboard (admin). Student and log data is never modified by reports.

## Security notes
The API token is the only protection: keep it private, share only with security/admin staff, and change it (`changeApiToken()`) if a device is lost. Don't use real student data without the college's approval.
