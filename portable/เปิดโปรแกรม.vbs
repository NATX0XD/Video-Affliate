' เปิด VDO Gen Auto Pilot
' ดับเบิลคลิกไฟล์นี้ → ระบบเริ่มทำงาน (ซ่อนหน้าต่าง) แล้วเปิดเบราว์เซอร์ให้อัตโนมัติ
Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
base = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = base
' 0 = ซ่อนหน้าต่าง (พ่อจะเห็นแค่เบราว์เซอร์เด้งขึ้น) · False = ไม่ต้องรอ
sh.Run """" & base & "\_start.bat""", 0, False
