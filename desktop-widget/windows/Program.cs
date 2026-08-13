using System.Diagnostics;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Win32;

namespace TodayWidget;

static class Program
{
    public const int ControlPort = 17891;
    const string MutexName = @"Local\WorkbenchTodayWidget";
    const string ProtocolName = "workbench-today";

    [STAThread]
    static void Main()
    {
        using var mutex = new Mutex(true, MutexName, out var created);
        if (!created) return;

        ApplicationConfiguration.Initialize();
        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        RegisterProtocol();
        Application.Run(new WidgetForm());
    }

    static void RegisterProtocol()
    {
        var exe = Application.ExecutablePath;
        using var key = Registry.CurrentUser.CreateSubKey($@"Software\Classes\{ProtocolName}");
        key.SetValue("", "URL:Workbench Today");
        key.SetValue("URL Protocol", "");
        using var command = key.CreateSubKey(@"shell\open\command");
        command.SetValue("", $"\"{exe}\" \"%1\"");
    }
}

sealed class WidgetForm : Form
{
    const int Grip = 8;
    const int DefaultWidth = 300;
    const int DefaultHeight = 360;
    const int DwmWindowCornerPreference = 33;
    const int DwmWcpRound = 2;

    readonly WebView2 webView = new();
    readonly HttpListener listener = new();
    Uri widgetUrl = new("http://127.0.0.1:5173/widget/today");
    string? pendingAccessToken;
    string? pendingRefreshToken;
    bool serverStarted;

    public WidgetForm()
    {
        Text = "今日安排便签";
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.Manual;
        MinimumSize = new Size(DefaultWidth, DefaultHeight);
        ClientSize = new Size(DefaultWidth, DefaultHeight);
        TopMost = true;
        ShowInTaskbar = false;
        BackColor = Color.FromArgb(247, 247, 255);
        Padding = new Padding(3);
        KeyPreview = true;
        RestoreBoundsFromDisk();

        webView.Dock = DockStyle.Fill;
        webView.DefaultBackgroundColor = Color.Transparent;
        Controls.Add(webView);

        Load += async (_, _) => await StartAsync();
        FormClosed += (_, _) => StopServer();
        Resize += (_, _) => ApplyRoundedCorners();
        Shown += (_, _) => ApplyRoundedCorners();
    }

    protected override CreateParams CreateParams
    {
        get
        {
            var cp = base.CreateParams;
            cp.Style |= 0x00040000; // WS_THICKFRAME
            return cp;
        }
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == 0x0084)
        {
            var cursor = PointToClient(Cursor.Position);
            var w = ClientSize.Width;
            var h = ClientSize.Height;
            var left = cursor.X <= Grip;
            var right = cursor.X >= w - Grip;
            var top = cursor.Y <= Grip;
            var bottom = cursor.Y >= h - Grip;
            if (left && top) { m.Result = 13; return; }
            if (right && top) { m.Result = 14; return; }
            if (left && bottom) { m.Result = 16; return; }
            if (right && bottom) { m.Result = 17; return; }
            if (left) { m.Result = 10; return; }
            if (right) { m.Result = 11; return; }
            if (top) { m.Result = 12; return; }
            if (bottom) { m.Result = 15; return; }
        }
        base.WndProc(ref m);
    }

    async Task StartAsync()
    {
        StartServer();
        try
        {
            var userData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "WorkbenchTodayWidget", "WebView2");
            Directory.CreateDirectory(userData);
            var env = await CoreWebView2Environment.CreateAsync(null, userData);
            await webView.EnsureCoreWebView2Async(env);
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                "无法启动 WebView2。请安装 Microsoft Edge WebView2 Runtime 后重试。\n\n官方下载：https://developer.microsoft.com/microsoft-edge/webview2/\n\n" + ex.Message,
                "今日安排便签无法启动",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            Close();
            return;
        }

        webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
        webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
        await webView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync("""
            window.webkit = window.webkit || {
              messageHandlers: {
                widget: {
                  postMessage: (value) => {
                    if (window.chrome && window.chrome.webview) window.chrome.webview.postMessage(value);
                  }
                }
              }
            };
            """);
        webView.CoreWebView2.WebMessageReceived += (_, e) =>
        {
            var message = e.TryGetWebMessageAsString();
            if (message == "quit") Close();
            else if (message == "drag") BeginDrag();
        };
        webView.CoreWebView2.NewWindowRequested += (_, e) =>
        {
            e.Handled = true;
            OpenExternal(e.Uri);
        };
        webView.CoreWebView2.NavigationCompleted += (_, _) => InjectPendingSession();
        Activated += (_, _) => ReloadTasks();
        ApplyRoundedCorners();
        ShowWidget();
    }

    void ShowWidget(string? origin = null, string? accessToken = null, string? refreshToken = null)
    {
        if (!string.IsNullOrWhiteSpace(origin) && Uri.TryCreate(origin.TrimEnd('/') + "/widget/today", UriKind.Absolute, out var url))
        {
            widgetUrl = url;
        }
        if (!string.IsNullOrEmpty(accessToken) && !string.IsNullOrEmpty(refreshToken))
        {
            pendingAccessToken = accessToken;
            pendingRefreshToken = refreshToken;
        }
        if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
        Show();
        Activate();
        TopMost = true;
        if (webView.CoreWebView2 != null)
        {
            webView.CoreWebView2.Navigate(widgetUrl.ToString());
        }
    }

    void InjectPendingSession()
    {
        if (webView.CoreWebView2 == null || pendingAccessToken == null || pendingRefreshToken == null) return;
        var payload = JsonSerializer.Serialize(new Dictionary<string, string>
        {
            ["access_token"] = pendingAccessToken,
            ["refresh_token"] = pendingRefreshToken,
        });
        pendingAccessToken = null;
        pendingRefreshToken = null;
        _ = webView.CoreWebView2.ExecuteScriptAsync(
            $"window.__workbenchWidgetSession = {payload}; window.dispatchEvent(new Event('workbench-widget-session'));");
    }

    void ReloadTasks()
    {
        if (webView.CoreWebView2 == null) return;
        _ = webView.CoreWebView2.ExecuteScriptAsync("window.dispatchEvent(new Event('workbench-widget-refresh'));");
    }

    void BeginDrag()
    {
        ReleaseCapture();
        _ = SendMessage(Handle, 0xA1, 2, 0);
    }

    void StartServer()
    {
        if (serverStarted) return;
        listener.Prefixes.Add($"http://127.0.0.1:{Program.ControlPort}/");
        try
        {
            listener.Start();
            serverStarted = true;
        }
        catch (Exception ex)
        {
            MessageBox.Show("无法启动便签控制服务：" + ex.Message, "今日安排便签无法启动", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
            return;
        }
        _ = Task.Run(ListenLoop);
    }

    async Task ListenLoop()
    {
        while (serverStarted && listener.IsListening)
        {
            HttpListenerContext context;
            try
            {
                context = await listener.GetContextAsync();
            }
            catch
            {
                break;
            }
            _ = Task.Run(() => HandleRequest(context));
        }
    }

    void HandleRequest(HttpListenerContext context)
    {
        var request = context.Request;
        var response = context.Response;
        var method = request.HttpMethod.ToUpperInvariant();
        var path = request.Url?.AbsolutePath ?? "/";
        var status = 200;
        var body = "{\"ok\":true}";
        Dictionary<string, string>? payload = null;

        if (method == "OPTIONS")
        {
            body = "";
        }
        else if (method == "POST" && path == "/show")
        {
            payload = ReadJson(request);
        }
        else if (method == "POST" && path == "/reload")
        {
        }
        else if (method == "POST" && path == "/quit")
        {
        }
        else if (method == "GET" && path == "/health")
        {
            body = "{\"ok\":true}";
        }
        else
        {
            status = 404;
            body = "{\"ok\":false}";
        }

        response.StatusCode = status;
        response.Headers.Add("Access-Control-Allow-Origin", "*");
        response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        response.Headers.Add("Access-Control-Allow-Headers", "content-type");
        response.ContentType = "application/json; charset=utf-8";
        var bytes = Encoding.UTF8.GetBytes(body);
        response.ContentLength64 = bytes.Length;
        using (var output = response.OutputStream)
        {
            output.Write(bytes, 0, bytes.Length);
        }

        BeginInvoke(new Action(() =>
        {
            if (method == "POST" && path == "/show")
            {
                ShowWidget(
                    payload?.GetValueOrDefault("origin"),
                    payload?.GetValueOrDefault("accessToken"),
                    payload?.GetValueOrDefault("refreshToken"));
            }
            else if (method == "POST" && path == "/reload") ReloadTasks();
            else if (method == "POST" && path == "/quit") Close();
        }));
    }

    static Dictionary<string, string> ReadJson(HttpListenerRequest request)
    {
        using var reader = new StreamReader(request.InputStream, request.ContentEncoding);
        var text = reader.ReadToEnd();
        if (string.IsNullOrWhiteSpace(text)) return [];
        try
        {
            using var doc = JsonDocument.Parse(text);
            var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var property in doc.RootElement.EnumerateObject())
            {
                map[property.Name] = property.Value.ValueKind == JsonValueKind.String
                    ? property.Value.GetString() ?? ""
                    : property.Value.ToString();
            }
            return map;
        }
        catch
        {
            return [];
        }
    }

    void StopServer()
    {
        SaveBoundsToDisk();
        serverStarted = false;
        try { listener.Stop(); listener.Close(); } catch { /* ignore */ }
    }

    static string BoundsPath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "WorkbenchTodayWidget",
        "window.txt");

    void RestoreBoundsFromDisk()
    {
        try
        {
            var text = File.ReadAllText(BoundsPath).Trim().Split(',');
            if (text.Length != 4) return;
            var bounds = new Rectangle(int.Parse(text[0]), int.Parse(text[1]), int.Parse(text[2]), int.Parse(text[3]));
            if (Screen.AllScreens.Any(screen => screen.WorkingArea.IntersectsWith(bounds)))
            {
                Bounds = bounds;
                return;
            }
        }
        catch
        {
            // 使用默认位置。
        }
        Location = new Point(80, 120);
    }

    void SaveBoundsToDisk()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(BoundsPath)!);
            File.WriteAllText(BoundsPath, $"{Left},{Top},{Width},{Height}");
        }
        catch
        {
            // 忽略位置保存失败。
        }
    }

    void ApplyRoundedCorners()
    {
        if (Environment.OSVersion.Version.Build >= 22000)
        {
            var preference = DwmWcpRound;
            _ = DwmSetWindowAttribute(Handle, DwmWindowCornerPreference, ref preference, sizeof(int));
            Region = null;
            return;
        }
        var radius = 18;
        var region = CreateRoundRectRgn(0, 0, Width + 1, Height + 1, radius * 2, radius * 2);
        Region = Region.FromHrgn(region);
        DeleteObject(region);
    }

    static void OpenExternal(string uri)
    {
        try
        {
            Process.Start(new ProcessStartInfo(uri) { UseShellExecute = true });
        }
        catch
        {
            // 外部打开失败时忽略。
        }
    }

    [DllImport("user32.dll")]
    static extern bool ReleaseCapture();

    [DllImport("user32.dll")]
    static extern IntPtr SendMessage(IntPtr hWnd, int msg, int wParam, int lParam);

    [DllImport("dwmapi.dll")]
    static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);

    [DllImport("gdi32.dll")]
    static extern IntPtr CreateRoundRectRgn(int left, int top, int right, int bottom, int widthEllipse, int heightEllipse);

    [DllImport("gdi32.dll")]
    static extern bool DeleteObject(IntPtr handle);
}
