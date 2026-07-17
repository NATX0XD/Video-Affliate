' เปิด VDO Gen Auto Pilot (รันจาก Python ในเครื่อง — ไม่ชน Antivirus)
' ดับเบิลคลิกไฟล์นี้ → ระบบเริ่มทำงานแบบซ่อนหน้าต่าง แล้วเปิดเบราว์เซอร์ให้เอง
' หมายเหตุ: ต้องรัน setup-prereqs.ps1 ครั้งเดียวก่อน (ติดตั้ง Python ฯลฯ)
Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
base = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = base
sh.Run """" & base & "\_run-source.bat""", 0, False
