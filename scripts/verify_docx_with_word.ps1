param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,

  [string]$PdfPath
)

$ErrorActionPreference = 'Stop'
$resolvedInput = (Resolve-Path -LiteralPath $InputPath -ErrorAction Stop).Path
if ([IO.Path]::GetExtension($resolvedInput) -notin @('.docx', '.doc')) {
  throw 'InputPath must point to a .docx or .doc file.'
}

$word = $null
$document = $null
$generatedPdf = $false

try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $document = $word.Documents.Open($resolvedInput, $false, $true)
  $document.Repaginate()
  $pageCount = $document.ComputeStatistics(2)

  if ($PdfPath) {
    $pdfFullPath = [IO.Path]::GetFullPath($PdfPath)
    $pdfDirectory = [IO.Path]::GetDirectoryName($pdfFullPath)
    if ($pdfDirectory -and -not [IO.Directory]::Exists($pdfDirectory)) {
      [IO.Directory]::CreateDirectory($pdfDirectory) | Out-Null
    }
    $document.ExportAsFixedFormat($pdfFullPath, 17)
    $generatedPdf = $true
  }

  [ordered]@{
    inputPath = $resolvedInput
    pageCount = $pageCount
    onePage = ($pageCount -eq 1)
    pdfPath = if ($generatedPdf) { $pdfFullPath } else { $null }
    renderer = 'Microsoft Word'
  } | ConvertTo-Json -Compress
}
catch {
  throw "Microsoft Word could not validate this document in the current Windows session: $($_.Exception.Message)"
}
finally {
  if ($document) {
    $document.Close($false)
    [Runtime.InteropServices.Marshal]::FinalReleaseComObject($document) | Out-Null
  }
  if ($word) {
    $word.Quit()
    [Runtime.InteropServices.Marshal]::FinalReleaseComObject($word) | Out-Null
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
