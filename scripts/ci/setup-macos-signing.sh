#!/usr/bin/env bash

# 一次性本地自签代码签名证书引导：生成 → 导入登录钥匙串 → 设置代码签名信任 → 导出 p12。
# 之后 CI 用该 p12 签名发布包，本机与更新包签名一致，Squirrel.Mac 静默自动更新才可用。
# 只生成一次；重复运行会生成新证书并导致旧签名应用无法静默更新到新签名包。

set -euo pipefail

CERT_NAME="${CERT_NAME:-ZCode Fork Signing}"
P12_PASSWORD="${P12_PASSWORD:-zcode-fork-signing}"
P12_OUT="${P12_OUT:-$HOME/zcode-fork-signing.p12}"
DAYS="${DAYS:-3650}"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

echo "[signing] 工作目录: $WORKDIR"
echo "[signing] 证书名: $CERT_NAME"

cat > "$WORKDIR/openssl.cnf" <<EOF
[req]
distinguished_name = dn
x509_extensions = v3_req
prompt = no
default_md = sha256
[dn]
CN = $CERT_NAME
O = ZCode Fork
[v3_req]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
EOF

echo "[signing] 1/4 生成密钥与自签证书（codesign EKU）"
openssl req -x509 -newkey rsa:3072 -sha256 -nodes \
  -keyout "$WORKDIR/key.pem" -out "$WORKDIR/cert.pem" \
  -days "$DAYS" -config "$WORKDIR/openssl.cnf"

echo "[signing] 2/4 导出 p12"
openssl pkcs12 -export -out "$WORKDIR/identity.p12" \
  -inkey "$WORKDIR/key.pem" -in "$WORKDIR/cert.pem" \
  -passout "pass:$P12_PASSWORD"

echo "[signing] 3/4 导入登录钥匙串（可能弹出授权框，输入登录密码）"
KEYCHAIN=~/Library/Keychains/login.keychain-db
security import "$WORKDIR/identity.p12" -k "$KEYCHAIN" -P "$P12_PASSWORD" -T /usr/bin/codesign

echo "[signing] 4/4 设置用户级代码签名信任"
security add-trusted-cert -r trustRoot -k "$KEYCHAIN" "$WORKDIR/cert.pem" || {
  echo "[signing] 命令行信任失败时，请在“钥匙串访问”中手动把该证书设为“始终信任”"
}

cp "$WORKDIR/identity.p12" "$P12_OUT"
chmod 600 "$P12_OUT"

CERT_SHA1=$(security find-certificate -c "$CERT_NAME" -Z "$KEYCHAIN" | awk '/SHA-1 hash/{print $3}')
echo ""
echo "[signing] 完成。证书 SHA-1: $CERT_SHA1"
echo "[signing] 本机验证: security find-identity -v -p codesigning | grep '$CERT_NAME'"
echo "[signing] p12 已保存: $P12_OUT（内含私钥，注意保管）"
echo ""
echo "[signing] 接下来上传 GitHub Secrets（两条命令）："
echo "  base64 -i '$P12_OUT' | gh secret set CSC_LINK --repo luantu/ZCode"
echo "  gh secret set CSC_KEY_PASSWORD --body '$P12_PASSWORD' --repo luantu/ZCode"
