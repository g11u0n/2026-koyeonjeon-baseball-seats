param([string]$Workbook)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (-not $Workbook) { $Workbook = (Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot '..\Jamsil Baseball Stadium') -Filter '*.xlsx' | Select-Object -First 1).FullName }
$zip = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $Workbook))
function Read-Xml($name) {
  $entry = $zip.GetEntry($name)
  if (-not $entry) { throw "Missing $name" }
  $reader = [IO.StreamReader]::new($entry.Open())
  try { return [xml]$reader.ReadToEnd() } finally { $reader.Dispose() }
}
try {
  $shared = @((Read-Xml 'xl/sharedStrings.xml').SelectNodes('//*[local-name()="si"]') | ForEach-Object { ($_.SelectNodes('.//*[local-name()="t"]') | ForEach-Object { $_.InnerText }) -join '' })
  $styleXml = Read-Xml 'xl/styles.xml'
  $fills = @($styleXml.SelectNodes('//*[local-name()="fills"]/*[local-name()="fill"]'))
  $xfs = @($styleXml.SelectNodes('//*[local-name()="cellXfs"]/*[local-name()="xf"]'))
  $bookXml = Read-Xml 'xl/workbook.xml'
  $relsXml = Read-Xml 'xl/_rels/workbook.xml.rels'
  $targets = @{}
  foreach ($rel in $relsXml.SelectNodes('//*[local-name()="Relationship"]')) { $targets[$rel.GetAttribute('Id')] = $rel.GetAttribute('Target') }
  $result = [ordered]@{ sheets = [ordered]@{} }
  foreach ($sheet in $bookXml.SelectNodes('//*[local-name()="sheet"]')) {
    $name = $sheet.GetAttribute('name')
    $id = [int]$sheet.GetAttribute('sheetId')
    if ($id -eq 1) { continue }
    $relId = $sheet.GetAttribute('id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
    $target = $targets[$relId].TrimStart('/')
    if ($target -notmatch '^xl/') { $target = "xl/$target" }
    $xml = Read-Xml $target
    $rows = [ordered]@{}
    foreach ($row in $xml.SelectNodes('//*[local-name()="sheetData"]/*[local-name()="row"]')) {
      $items = [ordered]@{}
      foreach ($cell in $row.SelectNodes('./*[local-name()="c"]')) {
        $address = $cell.GetAttribute('r')
        $valueNode = $cell.SelectSingleNode('./*[local-name()="v"]')
        $inline = $cell.SelectSingleNode('./*[local-name()="is"]')
        $raw = if ($null -ne $valueNode) { $valueNode.InnerText } elseif ($null -ne $inline) { $inline.InnerText } else { '' }
        if ($cell.GetAttribute('t') -eq 's' -and $raw -ne '') { $raw = $shared[[int]$raw] }
        $styleIndex = if ($cell.GetAttribute('s')) { [int]$cell.GetAttribute('s') } else { 0 }
        $fillIndex = [int]$xfs[$styleIndex].GetAttribute('fillId')
        $color = $fills[$fillIndex].SelectSingleNode('./*[local-name()="patternFill"]/*[local-name()="fgColor"]')
        $rgb = if ($color) { $color.GetAttribute('rgb') } else { '' }
        if ($raw -ne '' -or ($id -eq 2 -and $address -match '^E\d+$')) {
          $items[$address] = [ordered]@{ value = $raw; fill = $rgb }
        }
      }
      if ($items.Count) { $rows[[string]$row.GetAttribute('r')] = $items }
    }
    $result.sheets[$name] = $rows
  }
  $outputDir = Join-Path $PSScriptRoot '..\private-source'
  New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
  $output = Join-Path $outputDir 'workbook.json'
  [IO.File]::WriteAllText($output, ($result | ConvertTo-Json -Depth 12 -Compress), [Text.UTF8Encoding]::new($false))
  Write-Output "Read-only workbook extract: $output"
} finally { $zip.Dispose() }
