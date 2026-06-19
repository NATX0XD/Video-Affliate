' Start VDO Gen Auto Pilot (runs local Python, hidden window, opens browser)
' Double-click this. Requires setup-prereqs.ps1 to have been run once.
Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
base = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = base
sh.Run """" & base & "\_run-source.bat""", 0, False
