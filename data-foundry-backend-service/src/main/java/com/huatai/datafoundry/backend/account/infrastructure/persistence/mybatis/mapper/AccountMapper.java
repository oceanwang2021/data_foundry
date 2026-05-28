package com.huatai.datafoundry.backend.account.infrastructure.persistence.mybatis.mapper;

import com.huatai.datafoundry.backend.account.infrastructure.persistence.mybatis.record.AccountRecord;
import java.util.List;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface AccountMapper {
  @Select(
      "select account, password_hash as passwordHash, display_name as displayName, role, status, "
          + "created_at as createdAt, updated_at as updatedAt "
          + "from accounts where account = #{account}")
  AccountRecord getByAccount(@Param("account") String account);

  @Select(
      "select account, password_hash as passwordHash, display_name as displayName, role, status, "
          + "created_at as createdAt, updated_at as updatedAt "
          + "from accounts order by created_at desc")
  List<AccountRecord> listAll();

  @Select(
      "select account, password_hash as passwordHash, display_name as displayName, role, status, "
          + "created_at as createdAt, updated_at as updatedAt "
          + "from accounts where status = 'ACTIVE' order by display_name asc, account asc")
  List<AccountRecord> listActive();

  @Insert(
      "insert into accounts (account, password_hash, display_name, role, status) "
          + "values (#{account}, #{passwordHash}, #{displayName}, #{role}, #{status})")
  int insert(AccountRecord record);

  @Update(
      "update accounts set display_name = #{displayName}, role = #{role}, status = #{status} "
          + "where account = #{account}")
  int update(AccountRecord record);
}
