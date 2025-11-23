# TRMNL Screenshot Addon

Home Assistant addon for capturing screenshots of your Home Assistant dashboards and saving them in multiple formats. Perfect for sending display updates to TRMNL e-ink devices.

## Features

- **Headless Browser Capture**: Uses Playwright for reliable screenshot capture
- **Multiple Formats**: PNG, JPEG, and BMP3 (with dithering for e-ink displays)
- **Profile Management**: Create and manage multiple capture profiles
- **REST API**: Complete REST API for integration with other systems
- **Web UI**: Simple web interface for managing profiles and viewing captures
- **Concurrent Requests**: Handles multiple simultaneous capture requests
- **Format Conversion**: Automatic image format conversion with dithering

## Installation

### Via Home Assistant Add-on Store

1. Open Home Assistant and go to **Settings → Add-ons → Add-on Store**
2. Click the menu (⋮) and select **Repositories**
3. Add: `https://github.com/yourusername/ha-trmnl-screenshot-addon`
4. Search for "TRMNL Screenshot"
5. Click **Install**
6. Click **Start**

### Manual Installation

1. Copy this addon to your Home Assistant `addons/` directory
2. Go to **Settings → Add-ons → Local add-ons**
3. Find "TRMNL Screenshot"
4. Click **Install**
5. Click **Start**

## Configuration

The addon runs on port 5001 by default.

### Basic Configuration

```json
{
  "port": 5001,
  "ssl": false,
  "browser_args": []
}
```

## API Endpoints

### Health Check
```
GET /health
```
Returns addon status and version information.

**Response:**
```json
{
  "status": "ok",
  "addon": "TRMNL Screenshot",
  "version": "0.2.0",
  "browser_ready": true,
  "profiles": 5
}
```

### List Profiles
```
GET /api/profiles
```
Get all capture profiles.

**Response:**
```json
{
  "total": 2,
  "profiles": [
    {
      "id": "main-dashboard",
      "name": "Main Dashboard",
      "url": "http://homeassistant.local:8123/lovelace/0",
      "width": 800,
      "height": 480,
      "format": "png",
      "enabled": true
    }
  ]
}
```

### Get Profile
```
GET /api/profiles/{id}
```
Get a specific profile.

### Create Profile
```
POST /api/profiles
```
Create a new capture profile.

**Body:**
```json
{
  "id": "weather-display",
  "name": "Weather Display",
  "url": "http://homeassistant.local:8123/lovelace/1",
  "width": 800,
  "height": 480,
  "theme": "light",
  "outputFormat": "png"
}
```

### Capture Profile
```
POST /api/profiles/{id}/capture
```
Trigger immediate capture of a profile.

**Response:**
```json
{
  "success": true,
  "filename": "screenshot-2025-11-23T23-11-14-224Z-0fdd4984.png",
  "size": 12345,
  "width": 800,
  "height": 480,
  "format": "png",
  "timestamp": "2025-11-23T23:11:14.224Z"
}
```

### Get Screenshot
```
GET /api/screenshot/{filename}
```
Download a screenshot file.

### Get Latest Screenshot
```
GET /api/screenshot/latest
```
Get the most recently captured screenshot.

### List Recent Screenshots
```
GET /api/screenshots
```
List recent screenshots (max 20).

**Response:**
```json
{
  "total": 5,
  "screenshots": [
    {
      "filename": "screenshot-2025-11-23T23-11-14-224Z-0fdd4984.png",
      "size": 12345,
      "url": "/api/screenshot/screenshot-2025-11-23T23-11-14-224Z-0fdd4984.png"
    }
  ]
}
```

### Web UI
```
GET /
```
Access the web interface at `http://homeassistant.local:5001/`

## Profile Configuration

### Profile Fields

- **id** (required): Unique identifier for the profile
- **name** (required): Display name
- **url** (required): URL to capture (must be accessible to addon)
- **width** (optional): Screenshot width in pixels (default: 800)
- **height** (optional): Screenshot height in pixels (default: 480)
- **theme** (optional): "light" or "dark" (default: "light")
- **outputFormat** (optional): "png", "jpeg", or "bmp3" (default: "png")

### Example Profile

```json
{
  "id": "kitchen-dashboard",
  "name": "Kitchen Display",
  "url": "http://homeassistant.local:8123/lovelace/kitchen",
  "width": 800,
  "height": 480,
  "theme": "dark",
  "outputFormat": "png"
}
```

## Usage with Home Assistant

### With TRMNL Screenshot Integration

The [TRMNL Screenshot Integration](https://github.com/yourusername/ha-trmnl-screenshot-integration) automatically uses this addon:

```yaml
service: trmnl_screenshot.capture_and_send
data:
  device_id: "XX:XX:XX:XX:XX:XX"
  profile_id: "kitchen-dashboard"
```

### Direct API Calls

```yaml
automation:
  - alias: "Capture Kitchen Dashboard"
    trigger:
      platform: time_pattern
      minutes: "/30"
    action:
      - service: rest_command.capture_screenshot
        data:
          profile_id: "kitchen-dashboard"
      - service: rest_command.send_to_trmnl
        data:
          filename: "{{ state_attr('input_text.latest_screenshot', 'filename') }}"
```

## Image Format Conversion

### PNG
Standard format. Best for general use. Preserves all colors.

### JPEG
Compressed format. Smaller file sizes. Use for bandwidth-constrained scenarios.

### BMP3
Monochrome format with dithering. Optimized for e-ink displays.
- Supports 1-bit (black & white) and 2-bit (4 colors) dithering
- Floyd-Steinberg dithering algorithm for better quality

## Performance

- **Capture Time**: 1-5 seconds depending on page complexity
- **File Size**: 5-50 KB per screenshot (PNG)
- **Concurrent Captures**: Up to 3 simultaneous captures

## Troubleshooting

### "Browser not ready" Error
The Playwright browser is still initializing. Wait a few seconds and try again.

### Screenshots are blank
1. Verify the URL is correct and accessible from the addon container
2. Check if the page requires authentication
3. Increase the wait timeout for complex pages

### BMP3 format not working
BMP3 is only available for images with dimensions that work with 1-bit pixel alignment.

### Port already in use
Change the port in addon config if 5001 is in use on your system.

## Requirements

- Home Assistant OS or Home Assistant Container
- 512 MB RAM minimum (1 GB recommended)
- 500 MB disk space for addon and screenshots

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please submit pull requests or open issues on GitHub.

## Disclaimer

This addon is not officially affiliated with TRMNL or Home Assistant. Use at your own risk.
