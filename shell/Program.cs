using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

class PixelShell : Form
{
    [DllImport("user32.dll")]
    static extern bool SetWindowPos(IntPtr hWnd, IntPtr hAfter, int x, int y, int cx, int cy, uint flags);

    [DllImport("user32.dll")]
    static extern uint GetDpiForWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    static extern bool SetProcessDpiAwarenessContext(IntPtr value);

    [DllImport("user32.dll")]
    static extern bool SetProcessDPIAware();

    static readonly IntPtr DPI_PER_MONITOR_V2 = new IntPtr(-4);

    private const uint SWP_NOSIZE = 0x0001;
    private const uint SWP_NOMOVE = 0x0002;
    private const uint SWP_NOZORDER = 0x0004;

    private const int PORT = 8123;
    private const string URL = "http://127.0.0.1:8123/";
    private const string APP_TITLE = "PIXEL MUSIC";

    private static readonly string LogPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "boot.log");
    private static void Log(string m)
    {
        try { File.AppendAllText(LogPath, DateTime.Now.ToString("HH:mm:ss.fff") + " " + m + Environment.NewLine); } catch { }
    }

    private WebView2 web;
    private Process server;
    private Timer poll;
    private int mode;              // 0 none, 1 move, 2 resize
    private Point dragOffset;
    private Point anchorCursor;
    private Size anchorSize;

    public PixelShell()
    {
        Log("ctor");
        AutoScaleMode = AutoScaleMode.None;      // 否则 WinForms 会把 Bounds 再按 DPI 折一次
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.Manual;
        Bounds = new Rectangle(140, 60, 430, 700);
        BackColor = Color.FromArgb(0x12, 0x10, 0x0b);
        Text = APP_TITLE;

        web = new WebView2();
        web.Dock = DockStyle.Fill;
        Controls.Add(web);
    }

    protected override void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        // DeviceDpi is only trustworthy once the handle exists; size the window so the
        // WebView gets a 430x700 CSS viewport at any display scale.
        uint dpi = GetDpiForWindow(Handle);
        float scale = (dpi > 0 ? dpi : 96) / 96f;
        MinimumSize = new Size((int)(360 * scale), (int)(520 * scale));
        ApplyLogicalSize(scale);
        Log("dpi=" + dpi + " scale=" + scale + " target=" + (int)(430 * scale) + "x" + (int)(700 * scale));
        EnsureServer();
        StartWebView();

        // Watchdog: the port can look busy while the previous instance's server is still dying,
        // so "already up" is not proof of life. Re-check every few seconds and restart if needed.
        var health = new Timer();
        health.Interval = 5000;
        health.Tick += (s2, e2) =>
        {
            if (!PortOpen())
            {
                Log("watchdog: server down, restarting");
                EnsureServer();
            }
        };
        health.Start();
    }

    // WinForms re-scales form bounds around DPI notifications, so the physical size is set
    // through SetWindowPos instead: the WebView must end up with a 430x700 CSS viewport.
    private void ApplyLogicalSize(float scale)
    {
        int w = (int)(430 * scale), h = (int)(700 * scale);
        SetWindowPos(Handle, IntPtr.Zero, Left, Top, w, h, SWP_NOZORDER);
        if (web != null)
        {
            web.Bounds = ClientRectangle;
            web.Invalidate(true);
        }
        Log("size=" + w + "x" + h + " (css 430x700 @ " + scale + "x)");
    }

    private bool PortOpen()
    {
        try
        {
            using (var c = new TcpClient())
            {
                var ar = c.BeginConnect("127.0.0.1", PORT, null, null);
                if (!ar.AsyncWaitHandle.WaitOne(400)) return false;
                c.EndConnect(ar);
                return true;
            }
        }
        catch { return false; }
    }

    private void EnsureServer()
    {
        if (PortOpen()) { Log("server already up"); return; }
        if (server != null && !server.HasExited) return;
        Log("starting server");
        try
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string workDir = baseDir;
            string serverJs = Path.Combine(baseDir, "server.js");
            if (!File.Exists(serverJs))
            {
                string parent = Path.GetDirectoryName(baseDir.TrimEnd(Path.DirectorySeparatorChar));
                if (parent != null && File.Exists(Path.Combine(parent, "server.js")))
                {
                    workDir = parent;
                    serverJs = Path.Combine(parent, "server.js");
                }
            }
            string bundled = Path.Combine(baseDir, "node", "node.exe");
            string nodeExe = File.Exists(bundled) ? bundled : "node";
            Log("node=" + nodeExe + " server=" + serverJs);
            var psi = new ProcessStartInfo(nodeExe, "server.js");
            psi.WorkingDirectory = workDir;
            string tmpDir = Path.Combine(workDir, "tmp");
            try { Directory.CreateDirectory(tmpDir); } catch { }
            psi.EnvironmentVariables["TMP"] = tmpDir;
            psi.EnvironmentVariables["TEMP"] = tmpDir;
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            server = Process.Start(psi);
        }
        catch (Exception ex) { Log("server start failed: " + ex.Message); }
        for (int i = 0; i < 80; i++)
        {
            if (PortOpen()) { Log("server ready"); return; }
            System.Threading.Thread.Sleep(250);
        }
        Log("server NOT ready");
    }

    private async void StartWebView()
    {
        try
        {
            var dataDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "wv2-data");
            // play() is called from a fetch callback, i.e. outside the click gesture; without this
            // Chromium rejects it and the user has to press play a second time.
            var opts = new CoreWebView2EnvironmentOptions(
                "--autoplay-policy=no-user-gesture-required " +
                "--disable-features=CalculateNativeWinOcclusion " +
                "--disable-backgrounding-occluded-windows " +
                "--disable-renderer-backgrounding");
            var env = await CoreWebView2Environment.CreateAsync(null, dataDir, opts);
            await web.EnsureCoreWebView2Async(env);
            web.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            web.CoreWebView2.Settings.IsStatusBarEnabled = false;
            web.CoreWebView2.WebMessageReceived += OnWebMessage;
            web.CoreWebView2.NavigationCompleted += (s2, e2) =>
            {
                web.Bounds = ClientRectangle;
                web.Invalidate(true);
                Log("nav done ok=" + e2.IsSuccess);
            };
            Activated += (s2, e2) => { try { web.Bounds = ClientRectangle; web.Invalidate(true); } catch { } };
            web.CoreWebView2.Navigate(URL);
            Log("navigate issued");
        }
        catch (Exception ex)
        {
            Log("webview failed: " + ex);
            MessageBox.Show("WebView2 failed: " + ex.Message, APP_TITLE);
            Close();
        }
    }

    // The page only says what kind of gesture started. Once it has, the host polls the real
    // cursor and the real left-button state: page mousemove stops arriving the moment the
    // pointer leaves the window, which is exactly what happens while resizing.
    private void StartPoll(int newMode)
    {
        mode = newMode;
        if (poll == null)
        {
            poll = new Timer();
            poll.Interval = 15;
            poll.Tick += OnPoll;
        }
        poll.Start();
        OnPoll(null, EventArgs.Empty);
    }

    private void OnPoll(object sender, EventArgs e)
    {
        if ((Control.MouseButtons & MouseButtons.Left) == 0)
        {
            poll.Stop();
            mode = 0;
            return;
        }
        var p = Cursor.Position;
        if (mode == 1)
        {
            SetWindowPos(Handle, IntPtr.Zero, p.X - dragOffset.X, p.Y - dragOffset.Y, 0, 0, SWP_NOSIZE | SWP_NOZORDER);
        }
        else if (mode == 2)
        {
            int w = Math.Max(MinimumSize.Width, anchorSize.Width + (p.X - anchorCursor.X));
            int h = Math.Max(MinimumSize.Height, anchorSize.Height + (p.Y - anchorCursor.Y));
            SetWindowPos(Handle, IntPtr.Zero, 0, 0, w, h, SWP_NOMOVE | SWP_NOZORDER);
        }
    }

    private void OnWebMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        string kind = (e.TryGetWebMessageAsString() ?? "").Trim();
        if (kind == "close") { Close(); return; }
        if (kind == "min") { WindowState = FormWindowState.Minimized; return; }
        if (kind == "dragstart")
        {
            var p = Cursor.Position;
            dragOffset = new Point(p.X - Left, p.Y - Top);
            StartPoll(1);
            return;
        }
        if (kind == "resizestart")
        {
            anchorCursor = Cursor.Position;
            anchorSize = Size;
            StartPoll(2);
            return;
        }
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        if (poll != null) { poll.Stop(); poll.Dispose(); poll = null; }
        if (server != null)
        {
            try { if (!server.HasExited) server.Kill(); } catch { }
            server = null;
        }
        Log("closed");
        base.OnFormClosed(e);
    }

    [STAThread]
    static void Main()
    {
        try
        {
            Log("main start");
            // The embedded manifest alone did not take effect here; declare awareness at runtime.
            if (!SetProcessDpiAwarenessContext(DPI_PER_MONITOR_V2)) SetProcessDPIAware();
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new PixelShell());
        }
        catch (Exception ex)
        {
            Log("FATAL " + ex);
            try { MessageBox.Show(ex.ToString(), APP_TITLE); } catch { }
        }
    }
}
