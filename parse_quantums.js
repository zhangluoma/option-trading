#!/usr/bin/env node
/**
 * 解析dYdX的Gob编码的big.Int quantums
 * 
 * Go的big.Int GobEncode格式：
 * - 第一个字节 = (version << 1) | sign_bit
 *   - version = 1
 *   - sign_bit: 0=positive, 1=negative
 *   - 所以: 2 = positive, 3 = negative
 * - 剩余bytes = 绝对值的big-endian表示
 * 
 * 参考: https://go.dev/src/math/big/intmarsh.go
 */

/**
 * 解码Gob编码的big.Int
 * @param {Uint8Array|Array} bytes - Gob编码的bytes
 * @returns {bigint} - 解码后的整数
 */
function decodeGobBigInt(bytes) {
  if (!bytes || bytes.length === 0) {
    return 0n;
  }
  
  const firstByte = bytes[0];
  
  // 检查version
  const version = firstByte >> 1;
  if (version !== 1) {
    throw new Error(`Unsupported GobEncode version: ${version}`);
  }
  
  // 检查符号
  const isNegative = (firstByte & 1) !== 0;
  
  // 读取绝对值（big-endian）
  const valueBytes = bytes.slice(1);
  let value = 0n;
  for (let i = 0; i < valueBytes.length; i++) {
    value = value << 8n;
    value = value | BigInt(valueBytes[i]);
  }
  
  return isNegative ? -value : value;
}

/**
 * 将quantums转换为实际数量
 * @param {bigint} quantums - Quantums值
 * @param {number} atomicResolution - Atomic resolution (exponent)
 * @returns {number} - 实际数量
 */
function quantumsToNumber(quantums, atomicResolution) {
  const divisor = Math.pow(10, -atomicResolution);
  return Number(quantums) / divisor;
}

/**
 * 将实际数量转换为quantums
 * @param {number} amount - 实际数量
 * @param {number} atomicResolution - Atomic resolution (exponent)
 * @returns {bigint} - Quantums值
 */
function numberToQuantums(amount, atomicResolution) {
  const multiplier = Math.pow(10, -atomicResolution);
  return BigInt(Math.floor(amount * multiplier));
}

// 导出
module.exports = {
  decodeGobBigInt,
  quantumsToNumber,
  numberToQuantums
};

// CLI测试
if (require.main === module) {
  console.log('测试Gob解码:');
  console.log('');
  
  // USDC test
  const usdcBytes = [2, 12, 105, 27, 122];
  const usdcQuantums = decodeGobBigInt(usdcBytes);
  console.log('USDC:');
  console.log('  bytes:', usdcBytes);
  console.log('  quantums:', usdcQuantums.toString());
  console.log('  value:', quantumsToNumber(usdcQuantums, -6), 'USDC');
  console.log('');
  
  // LINK test
  const linkBytes = [3, 76, 75, 64];
  const linkQuantums = decodeGobBigInt(linkBytes);
  console.log('LINK:');
  console.log('  bytes:', linkBytes);
  console.log('  quantums:', linkQuantums.toString());
  console.log('  value:', quantumsToNumber(linkQuantums, -6), 'LINK');
  console.log('');
  
  // Round-trip test
  console.log('Round-trip测试:');
  const testAmount = 160.47;
  const testQuantums = numberToQuantums(testAmount, -6);
  const testBack = quantumsToNumber(testQuantums, -6);
  console.log('  原始:', testAmount);
  console.log('  quantums:', testQuantums.toString());
  console.log('  转回:', testBack);
  console.log('  匹配:', testAmount === testBack ? '✅' : '❌');
}
