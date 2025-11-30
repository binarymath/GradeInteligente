$certPassword = ConvertTo-SecureString -String "GradeInteligente2025" -Force -AsPlainText
$pfxFilePath = Join-Path -Path $PSScriptRoot -ChildPath "certificate.pfx"

Write-Host "Gerando certificado autoassinado para 'drackercompany'..."

# Create the certificate in the current user's store
$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=drackercompany" -CertStoreLocation "Cert:\CurrentUser\My" -NotAfter (Get-Date).AddYears(5)

# Export the certificate to a .pfx file
Export-PfxCertificate -Cert $cert -FilePath $pfxFilePath -Password $certPassword

Write-Host "Certificado gerado com sucesso em: $pfxFilePath"
Write-Host "Senha do certificado: GradeInteligente2025"
