import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractX509Der, describeCertificate, findCertificateInEntries } from '../main/apkLibrary/apkSignatureLogic';

/** Реальный самоподписанный X.509-сертификат (DER, base64), сгенерированный
 * один раз через `openssl req -x509 -newkey rsa:2048 ... -subj "/CN=Test
 * Developer/O=Test Org/C=US"` и зашитый статически -- НЕ через вызов openssl
 * в момент теста, поскольку доступность openssl на CI-раннере не
 * гарантирована и не должна быть требованием для прохождения тестов. */
const TEST_CERT_DER_BASE64 =
  'MIIDUzCCAjugAwIBAgIUUwFHSxZLIQTY6L6HQ30woDMtlGQwDQYJKoZIhvcNAQELBQAwOTEXMBUGA1UEAwwOVGVzdCBEZXZlbG9wZXIxETAPBgNVBAoMCFRlc3QgT3JnMQswCQYDVQQGEwJVUzAeFw0yNjA5MDcxOTE2MDlaFw0yNzA5MDcxOTE2MDlaMDkxFzAVBgNVBAMMDlRlc3QgRGV2ZWxvcGVyMREwDwYDVQQKDAhUZXN0IE9yZzELMAkGA1UEBhMCVVMwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQCYOWhZbVuxvkDVoysgPKAMNGp4jfWVuDfQb5ZtFb7GNydbvS/ZTjVTDQBJHJhP61jFnbWR7DQMMpZvW4ciMYxD8Eofn5Qsxi7xDoYKkqx9fpnjJERPnlVTTB5jWRho+xzyZKRhlZdriGF7ne8332eptztbGa6S54P2NSmnc23LkcGj0ZmakMl8yDayF1ayM0gix2EqnaKuDJgN7YZN840PYaKSM9d2EiMMPlZLpxBfmCPODf1oMqNmFgLSBuG5NBt222e827Fhj1YTFzx1mtIv4dhJT7TUClOY0bgpX4mXtyBQVEtyzrCrT0WeVPowx6aPkBq/WJW5W5rnDCsnPi0rAgMBAAGjUzBRMB0GA1UdDgQWBBS9c6pdx7NsEXWfMWbCkf4SAGHdDDAfBgNVHSMEGDAWgBS9c6pdx7NsEXWfMWbCkf4SAGHdDDAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQBrgSxpRMHzyFIymn1We4k9jkRnlgVJi1PohZAZ+Wj3Sz2//3Sb0lp+FnT3YWdcIwfuPedsdgRY1FM0B1TBj/HUmEEU0wXV9hy5AiucL8b4hXEtpWCe7KSRXR4aZIIatTvn7VYgocYJ/XjEtBKBSRrcN/cKSTq6CR9dyD2Yi62vm9EVvuy/YPihVtD70ICNgc/+UzMo2Y5ybey2L+aP5Yb09lyC65J3MyHsfuISamYpADIrASFEEkI31BHAnYcZdyMvYc9vd26VCF57YeazvC8MfVcubEoyYntzoT6zuy1IWvV0rkZysMDIQNd1oFum/NOFk62TWz7fA6Cb8CjUI19o';
const TEST_CERT_DER = Buffer.from(TEST_CERT_DER_BASE64, 'base64');
const TEST_CERT_FINGERPRINT256 =
  '3A:AC:CD:E4:B4:F3:91:DE:7F:18:B6:F1:C5:55:B0:F6:B4:74:71:54:AD:A6:A5:0A:D7:CC:DA:21:4E:11:14:1D';
const TEST_CERT_SERIAL = '5301474B164B2104D8E8BE87437D30A0332D9464';

test('extractX509Der finds a certificate that starts at offset 0', () => {
  const found = extractX509Der(TEST_CERT_DER);
  assert.ok(found);
  assert.deepEqual(found, TEST_CERT_DER);
});

test('extractX509Der finds a certificate embedded inside a larger buffer with leading/trailing junk', () => {
  const wrapped = Buffer.concat([Buffer.alloc(37, 0xab), TEST_CERT_DER, Buffer.alloc(19, 0xcd)]);
  const found = extractX509Der(wrapped);
  assert.ok(found);
  assert.equal(describeCertificate(found).fingerprint256, TEST_CERT_FINGERPRINT256);
});

test('extractX509Der skips a decoy "30 82" header with a bogus oversized length before finding the real certificate', () => {
  // Симулирует то, что реально встречается внутри PKCS#7 SignedData: другие
  // DER SEQUENCE где-то до сертификата, которые к нему не относятся --
  // сканирование должно распознать, что кандидат не парсится, и пойти дальше.
  const decoyWithBogusLength = Buffer.concat([Buffer.from([0x30, 0x82, 0xff, 0xff]), Buffer.alloc(20, 0x00)]);
  const decoyThatWontParse = Buffer.concat([Buffer.from([0x30, 0x82, 0x00, 0x32]), Buffer.alloc(50, 0xab)]);
  const wrapped = Buffer.concat([decoyWithBogusLength, decoyThatWontParse, TEST_CERT_DER, Buffer.alloc(30, 0xcd)]);
  const found = extractX509Der(wrapped);
  assert.ok(found);
  assert.equal(describeCertificate(found).fingerprint256, TEST_CERT_FINGERPRINT256);
});

test('extractX509Der returns undefined when the buffer contains no valid certificate', () => {
  assert.equal(extractX509Der(Buffer.alloc(200, 0x41)), undefined);
  assert.equal(extractX509Der(Buffer.from([0x30, 0x82, 0x00, 0x05, 1, 2, 3, 4, 5])), undefined);
});

test('describeCertificate extracts subject, issuer, fingerprint and serial, and detects self-signed', () => {
  const info = describeCertificate(TEST_CERT_DER);
  assert.match(info.subject, /CN=Test Developer/);
  assert.equal(info.subject, info.issuer);
  assert.equal(info.selfSigned, true);
  assert.equal(info.fingerprint256, TEST_CERT_FINGERPRINT256);
  assert.equal(info.serialNumber, TEST_CERT_SERIAL);
  assert.ok(info.validFrom.length > 0);
  assert.ok(info.validTo.length > 0);
});

test('findCertificateInEntries returns undefined when none of the entries contain a certificate', () => {
  assert.equal(findCertificateInEntries([Buffer.alloc(100, 0x11), Buffer.alloc(50, 0x22)]), undefined);
});

test('findCertificateInEntries skips entries that fail to parse and returns the first one that does', () => {
  const info = findCertificateInEntries([Buffer.alloc(80, 0x33), TEST_CERT_DER]);
  assert.ok(info);
  assert.equal(info.fingerprint256, TEST_CERT_FINGERPRINT256);
});
