package com.huatai.datafoundry.backend.account.application.service;

import com.huatai.datafoundry.backend.account.application.command.AccountLoginCommand;
import com.huatai.datafoundry.backend.account.application.command.AccountRegisterCommand;
import com.huatai.datafoundry.backend.account.application.command.AccountUpdateCommand;
import com.huatai.datafoundry.backend.account.application.query.dto.AccountReadDto;
import com.huatai.datafoundry.backend.account.application.query.dto.AuthLoginResultDto;
import com.huatai.datafoundry.backend.account.infrastructure.auth.AuthTokenService;
import com.huatai.datafoundry.backend.account.infrastructure.persistence.mybatis.mapper.AccountMapper;
import com.huatai.datafoundry.backend.account.infrastructure.persistence.mybatis.record.AccountRecord;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AccountAppService {
  private static final String STATUS_ACTIVE = "ACTIVE";
  private static final String STATUS_DISABLED = "DISABLED";

  private final AccountMapper accountMapper;
  private final AuthTokenService authTokenService;
  private final SecureRandom secureRandom = new SecureRandom();

  public AccountAppService(AccountMapper accountMapper, AuthTokenService authTokenService) {
    this.accountMapper = accountMapper;
    this.authTokenService = authTokenService;
  }

  public AccountReadDto register(AccountRegisterCommand command) {
    String account = requireNonBlank(command != null ? command.getAccount() : null, "Account is required");
    String password = requireNonBlank(command != null ? command.getPassword() : null, "Password is required");
    String displayName =
        requireNonBlank(command != null ? command.getDisplayName() : null, "Display name is required");
    String role = normalizeRole(command != null ? command.getRole() : null);

    if (accountMapper.getByAccount(account) != null) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "Account already exists");
    }

    AccountRecord record = new AccountRecord();
    record.setAccount(account);
    record.setPasswordHash(hashPassword(password));
    record.setDisplayName(displayName);
    record.setRole(role);
    record.setStatus(STATUS_ACTIVE);
    accountMapper.insert(record);
    return toReadDto(requireAccount(account));
  }

  public AuthLoginResultDto login(AccountLoginCommand command) {
    String account = requireNonBlank(command != null ? command.getAccount() : null, "Account is required");
    String password = requireNonBlank(command != null ? command.getPassword() : null, "Password is required");
    AccountRecord record = requireAccount(account);
    if (!STATUS_ACTIVE.equals(record.getStatus())) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Account is disabled");
    }
    if (!matchesPassword(password, record.getPasswordHash())) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid account or password");
    }

    AuthLoginResultDto dto = new AuthLoginResultDto();
    dto.setToken(authTokenService.issueToken(record.getAccount()));
    dto.setUser(toReadDto(record));
    return dto;
  }

  public AccountReadDto getCurrentUser(String token) {
    return toReadDto(requireActiveAccountByToken(token));
  }

  public List<AccountReadDto> listAccounts() {
    List<AccountReadDto> out = new ArrayList<AccountReadDto>();
    for (AccountRecord record : accountMapper.listAll()) {
      out.add(toReadDto(record));
    }
    return out;
  }

  public List<AccountReadDto> listActiveAccounts() {
    List<AccountReadDto> out = new ArrayList<AccountReadDto>();
    for (AccountRecord record : accountMapper.listActive()) {
      out.add(toReadDto(record));
    }
    return out;
  }

  public AccountReadDto updateAccount(String account, AccountUpdateCommand command) {
    AccountRecord existing = requireAccount(account);
    AccountRecord patch = new AccountRecord();
    patch.setAccount(existing.getAccount());
    patch.setDisplayName(
        command != null && command.getDisplayName() != null
            ? requireNonBlank(command.getDisplayName(), "Display name is required")
            : existing.getDisplayName());
    patch.setRole(
        command != null && command.getRole() != null ? normalizeRole(command.getRole()) : existing.getRole());
    patch.setStatus(
        command != null && command.getStatus() != null ? normalizeStatus(command.getStatus()) : existing.getStatus());
    accountMapper.update(patch);
    return toReadDto(requireAccount(account));
  }

  public AccountRecord requireActiveAccount(String account, String fieldName) {
    String normalized = requireNonBlank(account, fieldName + " is required");
    AccountRecord record = requireAccount(normalized);
    if (!STATUS_ACTIVE.equals(record.getStatus())) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, fieldName + " is disabled");
    }
    return record;
  }

  public AccountRecord requireActiveAccountByToken(String token) {
    String account = authTokenService.verifyAndExtractAccount(extractBearerToken(token));
    if (account == null || account.trim().isEmpty()) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unauthorized");
    }
    AccountRecord record = requireAccount(account);
    if (!STATUS_ACTIVE.equals(record.getStatus())) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Account is disabled");
    }
    return record;
  }

  private AccountRecord requireAccount(String account) {
    AccountRecord record = accountMapper.getByAccount(account);
    if (record == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found");
    }
    return record;
  }

  private static String extractBearerToken(String authorizationHeader) {
    if (authorizationHeader == null) {
      return null;
    }
    String trimmed = authorizationHeader.trim();
    if (trimmed.regionMatches(true, 0, "Bearer ", 0, 7)) {
      return trimmed.substring(7).trim();
    }
    return trimmed;
  }

  private String hashPassword(String password) {
    try {
      byte[] salt = new byte[16];
      secureRandom.nextBytes(salt);
      byte[] digest = sha256(salt, password.getBytes(StandardCharsets.UTF_8));
      return toHex(salt) + ":" + toHex(digest);
    } catch (Exception ex) {
      throw new IllegalStateException("Failed to hash password", ex);
    }
  }

  private boolean matchesPassword(String password, String stored) {
    if (stored == null || stored.trim().isEmpty()) {
      return false;
    }
    String[] parts = stored.split(":");
    if (parts.length != 2) {
      return false;
    }
    try {
      byte[] salt = parseHex(parts[0]);
      byte[] actual = sha256(salt, password.getBytes(StandardCharsets.UTF_8));
      byte[] expected = parseHex(parts[1]);
      return MessageDigest.isEqual(actual, expected);
    } catch (Exception ex) {
      return false;
    }
  }

  private static String toHex(byte[] bytes) {
    StringBuilder builder = new StringBuilder(bytes.length * 2);
    for (byte value : bytes) {
      builder.append(Character.forDigit((value >> 4) & 0xF, 16));
      builder.append(Character.forDigit(value & 0xF, 16));
    }
    return builder.toString();
  }

  private static byte[] parseHex(String value) {
    if (value == null || (value.length() % 2) != 0) {
      throw new IllegalArgumentException("Invalid hex value");
    }
    byte[] out = new byte[value.length() / 2];
    for (int i = 0; i < value.length(); i += 2) {
      int high = Character.digit(value.charAt(i), 16);
      int low = Character.digit(value.charAt(i + 1), 16);
      if (high < 0 || low < 0) {
        throw new IllegalArgumentException("Invalid hex value");
      }
      out[i / 2] = (byte) ((high << 4) + low);
    }
    return out;
  }

  private static byte[] sha256(byte[] salt, byte[] password) throws Exception {
    MessageDigest digest = MessageDigest.getInstance("SHA-256");
    digest.update(salt);
    digest.update(password);
    return digest.digest();
  }

  private static String requireNonBlank(String value, String message) {
    if (value == null || value.trim().isEmpty()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
    return value.trim();
  }

  private static String normalizeRole(String value) {
    String normalized = requireNonBlank(value, "Role is required").toUpperCase();
    if (!"DATA_BA".equals(normalized)
        && !"DATA_ENGINEER".equals(normalized)
        && !"BUSINESS_EXPERT".equals(normalized)
        && !"ADMIN".equals(normalized)) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid role");
    }
    return normalized;
  }

  private static String normalizeStatus(String value) {
    String normalized = requireNonBlank(value, "Status is required").toUpperCase();
    if (!STATUS_ACTIVE.equals(normalized) && !STATUS_DISABLED.equals(normalized)) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid status");
    }
    return normalized;
  }

  private static AccountReadDto toReadDto(AccountRecord record) {
    AccountReadDto dto = new AccountReadDto();
    dto.setAccount(record.getAccount());
    dto.setDisplayName(record.getDisplayName());
    dto.setRole(record.getRole());
    dto.setStatus(record.getStatus());
    dto.setCreatedAt(record.getCreatedAt());
    dto.setUpdatedAt(record.getUpdatedAt());
    return dto;
  }
}
