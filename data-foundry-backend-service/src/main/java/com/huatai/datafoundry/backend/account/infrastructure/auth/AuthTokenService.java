package com.huatai.datafoundry.backend.account.infrastructure.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class AuthTokenService {
  private final byte[] secretBytes;
  private final long ttlSeconds;

  public AuthTokenService(
      @Value("${datafoundry.auth.token-secret:data-foundry-dev-secret}") String secret,
      @Value("${datafoundry.auth.token-ttl-seconds:604800}") long ttlSeconds) {
    this.secretBytes = secret.getBytes(StandardCharsets.UTF_8);
    this.ttlSeconds = ttlSeconds;
  }

  public String issueToken(String account) {
    long expiresAt = Instant.now().getEpochSecond() + ttlSeconds;
    String accountPart = base64Url(account.getBytes(StandardCharsets.UTF_8));
    String signature = sign(account, expiresAt);
    return accountPart + "." + expiresAt + "." + signature;
  }

  public String verifyAndExtractAccount(String token) {
    if (token == null || token.trim().isEmpty()) {
      return null;
    }
    String[] parts = token.trim().split("\\.");
    if (parts.length != 3) {
      return null;
    }
    String account;
    long expiresAt;
    try {
      account = new String(Base64.getUrlDecoder().decode(parts[0]), StandardCharsets.UTF_8);
      expiresAt = Long.parseLong(parts[1]);
    } catch (Exception ex) {
      return null;
    }
    if (expiresAt < Instant.now().getEpochSecond()) {
      return null;
    }
    String expected = sign(account, expiresAt);
    if (!MessageDigest.isEqual(
        expected.getBytes(StandardCharsets.UTF_8),
        parts[2].getBytes(StandardCharsets.UTF_8))) {
      return null;
    }
    return account;
  }

  private String sign(String account, long expiresAt) {
    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(secretBytes, "HmacSHA256"));
      byte[] payload = (account + "\n" + expiresAt).getBytes(StandardCharsets.UTF_8);
      return base64Url(mac.doFinal(payload));
    } catch (Exception ex) {
      throw new IllegalStateException("Failed to sign auth token", ex);
    }
  }

  private static String base64Url(byte[] value) {
    return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
  }
}
