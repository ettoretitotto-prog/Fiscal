<#
.SYNOPSIS
    Fiscal - Setup iniziale della stampante virtuale e delle dipendenze
.DESCRIPTION
    Questo script prepara il PC Windows per l'uso di Fiscal:
    1. Installa/verifica Node.js (tramite winget se necessario)
    2. Crea la porta locale C:\FiscalPrintLocalPort\output.prn
    3. Crea la stampante virtuale "Fiscal LocalPort Printer"
    4. Esegue npm install nella cartella del progetto
    
    Richiede privilegi di amministratore per i passi 2-3-4.
    Se non viene eseguito come admin, si rilancia automaticamente.
#>

# ============================================================================
# AUTO-ELEVAZIONE AD AMMINISTRATORE
# ============================================================================
# Se lo script non è già in esecuzione come amministratore, si rilancia da solo
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "🔐 Richiedo privilegi di amministratore..." -ForegroundColor Yellow
    $scriptPath = $MyInvocation.MyCommand.Path
    $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""
    Start-Process powershell -Verb RunAs -ArgumentList $arguments
    exit
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "   FISCAL - FIRST SETUP" -ForegroundColor Cyan
Write-Host "   Configurazione iniziale del sistema" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ============================================================================
# 1. VERIFICA / INSTALLA NODE.JS
# ============================================================================
Write-Host "📦 Verifica Node.js..." -ForegroundColor Yellow

$nodeVersion = $null
try {
    $nodeVersion = node --version 2>$null
} catch {}

if ($nodeVersion) {
    Write-Host "   ✅ Node.js gia' installato: $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  Node.js non trovato. Provo a installarlo con winget..." -ForegroundColor Yellow
    
    try {
        $wingetCheck = winget --version 2>$null
        if (-not $wingetCheck) {
            Write-Host "   ❌ winget non disponibile su questo sistema." -ForegroundColor Red
            Write-Host "   Scarica e installa Node.js manualmente da: https://nodejs.org" -ForegroundColor Red
            Write-Host "   Dopo l'installazione, esegui di nuovo questo script." -ForegroundColor Red
            pause
            exit 1
        }
        
        Write-Host "   ⏳ Installazione Node.js LTS in corso (potrebbe richiedere un paio di minuti)..." -ForegroundColor Yellow
        winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent 2>&1 | Out-Null
        
        # Forza l'aggiornamento del PATH per questa sessione
        $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
        
        # Ri-prova a leggere la versione
        $nodeVersion = node --version 2>$null
        if ($nodeVersion) {
            Write-Host "   ✅ Node.js installato: $nodeVersion" -ForegroundColor Green
        } else {
            Write-Host "   ⚠️  Node.js installato, ma apri una nuova finestra e riavvia lo script." -ForegroundColor Red
            pause
            exit 1
        }
    } catch {
        Write-Host "   ❌ Errore durante l'installazione di Node.js: $_" -ForegroundColor Red
        Write-Host "   Scarica e installa Node.js manualmente da: https://nodejs.org" -ForegroundColor Red
        pause
        exit 1
    }
}

# Verifica anche npm
try {
    $npmVersion = npm --version 2>$null
    Write-Host "   ✅ npm $npmVersion disponibile" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️  npm non trovato (dovrebbe essere incluso in Node.js)" -ForegroundColor Yellow
}

Write-Host ""

# ============================================================================
# 2. CREAZIONE CARTELLA PORTA STAMPANTE
# ============================================================================
Write-Host "📁 Creazione cartella porta stampante..." -ForegroundColor Yellow
try {
    New-Item -ItemType Directory -Path "C:\FiscalPrintLocalPort" -Force | Out-Null
    Write-Host "   ✅ Cartella C:\FiscalPrintLocalPort creata/verificata" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Errore creazione cartella: $_" -ForegroundColor Red
    pause
    exit 1
}

Write-Host ""

# ============================================================================
# 3. CREAZIONE PORTA STAMPANTE
# ============================================================================
Write-Host "🔌 Creazione porta stampante locale..." -ForegroundColor Yellow
try {
    $existingPorts = Get-PrinterPort -Name "C:\FiscalPrintLocalPort\output.prn" -ErrorAction SilentlyContinue
    if (-not $existingPorts) {
        Add-PrinterPort -Name "C:\FiscalPrintLocalPort\output.prn"
        Write-Host "   ✅ Porta creata: C:\FiscalPrintLocalPort\output.prn" -ForegroundColor Green
    } else {
        Write-Host "   ✅ Porta gia' esistente: C:\FiscalPrintLocalPort\output.prn" -ForegroundColor Green
    }
} catch {
    Write-Host "   ❌ Errore creazione porta: $_" -ForegroundColor Red
    pause
    exit 1
}

Write-Host ""

# ============================================================================
# 4. CREAZIONE STAMPANTE VIRTUALE
# ============================================================================
Write-Host "🖨️  Creazione stampante virtuale..." -ForegroundColor Yellow
try {
    $existingPrinter = Get-Printer -Name "Fiscal LocalPort Printer" -ErrorAction SilentlyContinue
    if (-not $existingPrinter) {
        Add-Printer -Name "Fiscal LocalPort Printer" -DriverName "Generic / Text Only" -PortName "C:\FiscalPrintLocalPort\output.prn"
        Write-Host "   ✅ Stampante creata: Fiscal LocalPort Printer" -ForegroundColor Green
    } else {
        Write-Host "   ✅ Stampante gia' esistente: Fiscal LocalPort Printer" -ForegroundColor Green
    }
} catch {
    Write-Host "   ❌ Errore creazione stampante: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "   Possibili cause:" -ForegroundColor Yellow
    Write-Host "   - Driver 'Generic / Text Only' non disponibile (prova a fare Windows Update)" -ForegroundColor Yellow
    Write-Host "   - Servizio Spooler non attivo" -ForegroundColor Yellow
    pause
    exit 1
}

Write-Host ""

# Verifica finale stampante
$printerCheck = Get-Printer -Name "Fiscal LocalPort Printer" -ErrorAction SilentlyContinue
if ($printerCheck) {
    Write-Host "   ℹ️  La stampante e' configurata sulla porta: $($printerCheck.PortName)" -ForegroundColor Gray
    Write-Host "   ℹ️  Driver: $($printerCheck.DriverName)" -ForegroundColor Gray
} else {
    Write-Host "   ⚠️  Verifica fallita: la stampante non e' stata trovata dopo la creazione." -ForegroundColor Red
    pause
    exit 1
}

Write-Host ""

# ============================================================================
# 5. INSTALLAZIONE DIPENDENZE PROGETTO (npm install)
# ============================================================================
Write-Host "📦 Installazione dipendenze del progetto..." -ForegroundColor Yellow
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectDir

try {
    npm install 2>&1 | Out-Host
    Write-Host "   ✅ Dipendenze installate correttamente" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Errore durante npm install: $_" -ForegroundColor Red
    Write-Host "   Puoi eseguire manualmente 'npm install' nella cartella del progetto." -ForegroundColor Yellow
    pause
    exit 1
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "   ✅ SETUP COMPLETATO CON SUCCESSO!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Ora puoi avviare i servizi con un doppio clic su:" -ForegroundColor White
Write-Host "   run.bat" -ForegroundColor Yellow
Write-Host ""
Write-Host "Cosa e' stato fatto:" -ForegroundColor White
Write-Host "   ✅ Node.js $nodeVersion" -ForegroundColor Gray
Write-Host "   ✅ Cartella C:\FiscalPrintLocalPort creata" -ForegroundColor Gray
Write-Host "   ✅ Porta stampante configurata" -ForegroundColor Gray
Write-Host "   ✅ Stampante 'Fiscal LocalPort Printer' creata" -ForegroundColor Gray
Write-Host "   ✅ Dipendenze npm installate" -ForegroundColor Gray
Write-Host ""
Write-Host "Ora devi configurare il gestionale di cassa per stampare" -ForegroundColor White
Write-Host "sulla stampante 'Fiscal LocalPort Printer'." -ForegroundColor White
Write-Host ""
pause