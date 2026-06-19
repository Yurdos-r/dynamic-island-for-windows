param()

$ErrorActionPreference = "SilentlyContinue"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public sealed class ClipboardListenerWindow : NativeWindow, IDisposable
{
    private const int WM_CLIPBOARDUPDATE = 0x031D;

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool AddClipboardFormatListener(IntPtr hwnd);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool RemoveClipboardFormatListener(IntPtr hwnd);

    public event EventHandler ClipboardUpdated;

    public ClipboardListenerWindow()
    {
        CreateHandle(new CreateParams());
        AddClipboardFormatListener(Handle);
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == WM_CLIPBOARDUPDATE)
        {
            EventHandler handler = ClipboardUpdated;
            if (handler != null)
            {
                handler(this, EventArgs.Empty);
            }
        }

        base.WndProc(ref m);
    }

    public void Dispose()
    {
        RemoveClipboardFormatListener(Handle);
        DestroyHandle();
    }
}
"@ -ReferencedAssemblies System.Windows.Forms.dll

function Write-JsonLine($Payload) {
  try {
    $json = $Payload | ConvertTo-Json -Compress -Depth 4
    [Console]::Out.WriteLine($json)
    [Console]::Out.Flush()
  } catch {
  }
}

function Read-ClipboardText {
  try {
    if ([System.Windows.Forms.Clipboard]::ContainsText([System.Windows.Forms.TextDataFormat]::UnicodeText)) {
      return [System.Windows.Forms.Clipboard]::GetText([System.Windows.Forms.TextDataFormat]::UnicodeText)
    }
  } catch {
  }

  return ""
}

$script:lastText = Read-ClipboardText
$listener = New-Object ClipboardListenerWindow

Write-JsonLine @{
  type = "status"
  status = "ready"
  transport = "win32-clipboard-listener"
  updatedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
}

$listener.add_ClipboardUpdated({
  $text = Read-ClipboardText

  if ([string]::IsNullOrWhiteSpace($text) -or $text -eq $script:lastText) {
    return
  }

  $script:lastText = $text
  Write-JsonLine @{
    type = "clipboard"
    text = $text
    transport = "win32-clipboard-listener"
    updatedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  }
})

try {
  [System.Windows.Forms.Application]::Run()
} finally {
  $listener.Dispose()
}
