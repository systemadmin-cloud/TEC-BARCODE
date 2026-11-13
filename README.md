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
- **Auto**: the first scan of each day is **OUT** by default, the next scan is IN, then it alternates. Change which one comes first with the **⇄ button** on the scan screen or in ⚙️ Settings → *Auto mode – direction of the first scan of the day* (saved per device). **Manual / Only IN / Only OUT** also available.
- Repeat scan of the same student within 10 s is ignored (server) and within 4 s (browser).
- **Desk / phone scanner**: the scanned number stays in the box (and under “Last scanned”) until the next scan replaces it or you press *Clear*. When something is not saved the screen says **NOT RECORDED** and why.
- **Student phone numbers** (student + parent) are **hidden by default** everywhere (scanner student panel, admin Live Status, Student Details, Hostel Requests, Reports). Press **👁 View phone** / **View details** to show them; they hide again after 30 s or on **Hide**. The backend only sends the full number on that click, and each view is logged in the `System_Audit` sheet.
- **Warden permission switch** (⚙️ Settings on scan, desk and admin – one shared setting): **Enabled** = hostel students need warden approval (choose *OUT*, *IN* or *Both*); **Disabled** = everyone scans normally. Day scholars are never asked. Default: Enabled for OUT only.
  - OUT without approval creates a PENDING request, the warden approves in *Admin → Hostel Requests*, the scanner shows the approval and the next scan records it.
  - IN permission works the same way (request type *IN*). A student returning from an approved outing is let in without a new request.
  - Admin “Manual IN/OUT” is never blocked.
- **Admin**: *Live Status* has a **🔴 Real-time** switch with 5 / 10 / 20 / 30 / 60 s refresh; new *Student Details* tab (search + View details).
- Inactive cards (Card_Status ≠ ACTIVE) and unknown IDs are rejected and never logged.
- Barcode or register number both work.
- Reports: daily/monthly (desk), filtered export + live dashboard (admin). Student and log data is never modified by reports.

## Updating an existing deployment
Paste the new `apps-script/Code.gs`, then **Deploy → Manage deployments → Edit → New version**. New columns/sheets (`Request_Type` in Outing_Requests, `System_Audit`) are created automatically. Student sheet columns `Students Mobile` and `Parent mobile` are used for the phone numbers.

## Security notes
The API token is the only protection: keep it private, share only with security/admin staff, and change it (`changeApiToken()`) if a device is lost. Don't use real student data without the college's approval.
