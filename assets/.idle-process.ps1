$references = @(
    (Join-Path $PSHOME 'System.Runtime.dll'),
    (Join-Path $PSHOME 'System.Collections.dll'),
    (Join-Path $PSHOME 'System.Drawing.Common.dll'),
    (Join-Path $PSHOME 'System.Drawing.Primitives.dll')
)
Add-Type -ReferencedAssemblies $references -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;

public static class IdleSpriteProcessor
{
    private sealed class Component
    {
        public readonly List<int> Pixels = new List<int>();
        public int MinX = int.MaxValue, MaxX = int.MinValue;
        public int MinY = int.MaxValue, MaxY = int.MinValue;
        public int Count { get { return Pixels.Count; } }
    }

    private static readonly Color Background = Color.FromArgb(255, 0, 255);
    private static readonly Color[] Palette = new[] {
        Color.FromArgb(0x1A, 0x10, 0x30),
        Color.FromArgb(0x23, 0x32, 0x4D),
        Color.FromArgb(0x17, 0x23, 0x3A),
        Color.FromArgb(0x3C, 0x5A, 0x86),
        Color.FromArgb(0xF2, 0xF5, 0xF9),
        Color.FromArgb(0x10, 0x16, 0x23),
        Color.FromArgb(0xE5, 0x8F, 0xA2),
        Color.FromArgb(0xBF, 0xE3, 0xFF)
    };

    private static Color Quantize(Color source)
    {
        Color best = Palette[0];
        int bestDistance = int.MaxValue;
        foreach (Color candidate in Palette)
        {
            int dr = source.R - candidate.R;
            int dg = source.G - candidate.G;
            int db = source.B - candidate.B;
            int distance = dr * dr + dg * dg + db * db;
            if (distance < bestDistance)
            {
                best = candidate;
                bestDistance = distance;
            }
        }
        return best;
    }

    public static void Run(string sourcePath, string outputPath)
    {
        using (var source = new Bitmap(sourcePath))
        using (var output = new Bitmap(2048, 256, PixelFormat.Format32bppArgb))
        using (Graphics graphics = Graphics.FromImage(output))
        {
            graphics.Clear(Background);
            Bitmap firstFrame = null;
            for (int frame = 0; frame < 8; frame++)
            {
                if (frame == 7)
                {
                    graphics.DrawImageUnscaled(firstFrame, frame * 256, 0);
                    continue;
                }

                Bitmap cell = ExtractFrame(source, frame);
                if (frame == 0)
                    firstFrame = new Bitmap(cell);
                graphics.DrawImageUnscaled(cell, frame * 256, 0);
                cell.Dispose();
            }
            if (firstFrame != null)
                firstFrame.Dispose();
            output.Save(outputPath, ImageFormat.Png);
        }
    }

    private static Bitmap ExtractFrame(Bitmap source, int frame)
    {
        const int windowWidth = 288;
        const int windowHeight = 256;
        const int sourceY = 264;
        int center = (int)Math.Round((frame + 0.5) * source.Width / 8.0);
        int sourceX = center - windowWidth / 2;
        int length = windowWidth * windowHeight;
        bool[] foreground = new bool[length];
        Color[] colors = new Color[length];

        for (int y = 0; y < windowHeight; y++)
        {
            for (int x = 0; x < windowWidth; x++)
            {
                int sx = sourceX + x;
                int sy = sourceY + y;
                int index = y * windowWidth + x;
                if (sx < 0 || sx >= source.Width || sy < 0 || sy >= source.Height)
                    continue;
                Color color = source.GetPixel(sx, sy);
                if (color.A == 0 || (color.R < 8 && color.G < 8 && color.B < 8))
                    continue;
                foreground[index] = true;
                colors[index] = Quantize(color);
            }
        }

        var components = FindComponents(foreground, windowWidth, windowHeight);
        Component main = null;
        foreach (Component component in components)
            if (main == null || component.Count > main.Count)
                main = component;

        var cell = new Bitmap(256, 256, PixelFormat.Format32bppArgb);
        using (Graphics graphics = Graphics.FromImage(cell))
            graphics.Clear(Background);
        if (main == null)
            return cell;

        bool[] keep = new bool[length];
        double mainCenterX = (main.MinX + main.MaxX) / 2.0;
        foreach (Component component in components)
        {
            bool insideMainBounds = component.MinX >= main.MinX && component.MaxX <= main.MaxX
                && component.MinY >= main.MinY && component.MaxY <= main.MaxY;
            double componentCenterX = (component.MinX + component.MaxX) / 2.0;
            bool foamAbove = component.Count >= 2 && component.MaxY < main.MinY + 14
                && Math.Abs(componentCenterX - mainCenterX) <= 52;
            if (component == main || insideMainBounds || foamAbove)
                foreach (int index in component.Pixels)
                    keep[index] = true;
        }

        int offsetX = 128 - (int)Math.Round(mainCenterX);
        for (int y = 0; y < windowHeight; y++)
        {
            for (int x = 0; x < windowWidth; x++)
            {
                int index = y * windowWidth + x;
                if (!keep[index])
                    continue;
                int targetX = x + offsetX;
                if (targetX >= 0 && targetX < 256)
                    cell.SetPixel(targetX, y, colors[index]);
            }
        }
        return cell;
    }

    private static List<Component> FindComponents(bool[] foreground, int width, int height)
    {
        var result = new List<Component>();
        bool[] visited = new bool[foreground.Length];
        int[] queue = new int[foreground.Length];
        int[] dx = { -1, 1, 0, 0 };
        int[] dy = { 0, 0, -1, 1 };

        for (int start = 0; start < foreground.Length; start++)
        {
            if (!foreground[start] || visited[start])
                continue;
            var component = new Component();
            int head = 0, tail = 0;
            queue[tail++] = start;
            visited[start] = true;
            while (head < tail)
            {
                int index = queue[head++];
                int x = index % width;
                int y = index / width;
                component.Pixels.Add(index);
                component.MinX = Math.Min(component.MinX, x);
                component.MaxX = Math.Max(component.MaxX, x);
                component.MinY = Math.Min(component.MinY, y);
                component.MaxY = Math.Max(component.MaxY, y);
                for (int direction = 0; direction < 4; direction++)
                {
                    int nx = x + dx[direction];
                    int ny = y + dy[direction];
                    if (nx < 0 || nx >= width || ny < 0 || ny >= height)
                        continue;
                    int next = ny * width + nx;
                    if (foreground[next] && !visited[next])
                    {
                        visited[next] = true;
                        queue[tail++] = next;
                    }
                }
            }
            result.Add(component);
        }
        return result;
    }
}
'@

[IdleSpriteProcessor]::Run(
    'C:\Users\wqf18\.codex\generated_images\01a00a29-d2f3-7851-8506-663993f7a336\exec-66809093-5f01-47e8-a636-7d1d1d5fafc9.png',
    'D:\code\whale-on-desk\assets\idle.png'
)
