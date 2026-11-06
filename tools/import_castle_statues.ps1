
# Public CC0 scans, bundled locally so the game never needs a third-party request.
$ErrorActionPreference = 'Stop'
$destination = Join-Path $PSScriptRoot '../public/castle/statues'
foreach ($asset in @('marble_bust_01','gothic_statue')) {
    $entry = (Invoke-RestMethod ('https://api.polyhaven.com/files/' + $asset)).gltf.'1k'.gltf
    $folder = Join-Path $destination $asset
    New-Item -ItemType Directory -Force -Path $folder | Out-Null
    Invoke-WebRequest -Uri $entry.url -OutFile (Join-Path $folder ($asset + '.gltf'))
    foreach ($item in $entry.include.PSObject.Properties) {
        $file = Join-Path $folder $item.Name
        New-Item -ItemType Directory -Force -Path (Split-Path $file) | Out-Null
        Invoke-WebRequest -Uri $item.Value.url -OutFile $file
    }
    Write-Output "Bundled $asset (Poly Haven CC0)"
}
