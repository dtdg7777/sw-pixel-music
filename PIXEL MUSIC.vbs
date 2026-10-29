' Launch PIXEL MUSIC silently: resolve node, start the local server + compact app window.
Option Explicit
Dim sh, fso, proj, nodeExe, logFile, p, parts, cands, c, cmd
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
proj = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = proj
logFile = proj & "\launcher.log"

On Error Resume Next
sh.Environment("PROCESS").Remove "ELECTRON_RUN_AS_NODE"
On Error GoTo 0

nodeExe = ""
parts = Split(sh.ExpandEnvironmentStrings("%PATH%"), ";")
For Each p In parts
  If Len(p) > 0 Then
    If fso.FileExists(p & "\node.exe") Then nodeExe = p & "\node.exe" : Exit For
  End If
Next
If nodeExe = "" Then
  cands = Array("D:\softwares\nodejs\node.exe", "C:\Program Files\nodejs\node.exe")
  For Each c In cands
    If fso.FileExists(c) Then nodeExe = c : Exit For
  Next
End If
If nodeExe = "" Then
  MsgBox "PIXEL MUSIC: cannot find node.exe. Install Node.js first.", 48, "PIXEL MUSIC"
  WScript.Quit 1
End If

cmd = "cmd /c """"" & nodeExe & """ """ & proj & "\launcher.js"" >> """ & logFile & """ 2>&1"""
sh.Run cmd, 0, False
