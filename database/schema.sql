-- dYdX Trading Database Schema
-- 用于记录区块扫描、订单、交易历史

CREATE DATABASE IF NOT EXISTS dydx_trading
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE dydx_trading;

-- 1. 已扫描区块记录表
CREATE TABLE IF NOT EXISTS scanned_blocks (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  height BIGINT NOT NULL UNIQUE,
  scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  has_orders BOOLEAN DEFAULT FALSE,
  order_count INT DEFAULT 0,
  INDEX idx_height (height),
  INDEX idx_scanned_at (scanned_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. 订单/成交记录表（最重要）
CREATE TABLE IF NOT EXISTS fills (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  
  -- 区块信息
  height BIGINT NOT NULL,
  block_time TIMESTAMP NOT NULL,
  
  -- 订单信息
  ticker VARCHAR(20) NOT NULL,
  market VARCHAR(30) NOT NULL,
  side ENUM('BUY', 'SELL') NOT NULL,
  
  -- 价格和数量（原始值）
  quantums VARCHAR(50) NOT NULL,  -- 原始quantums字符串
  subticks VARCHAR(50) NOT NULL,  -- 原始subticks字符串
  
  -- 转换后的值（方便查询）
  size DECIMAL(20, 8) NULL,       -- 转换后的数量
  price DECIMAL(20, 8) NULL,      -- 转换后的价格
  
  -- 订单标识
  client_id BIGINT NOT NULL,
  clob_pair_id INT NOT NULL,
  order_flags INT DEFAULT 0,
  time_in_force INT DEFAULT 0,
  
  -- 元数据
  source ENUM('REALTIME', 'HISTORICAL', 'DAEMON') DEFAULT 'REALTIME',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- 索引
  UNIQUE KEY unique_order (height, client_id),
  INDEX idx_ticker (ticker),
  INDEX idx_block_time (block_time),
  INDEX idx_side (side),
  INDEX idx_height (height),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. 交易历史表（daemon记录的完整交易）
CREATE TABLE IF NOT EXISTS trades (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  
  -- 交易基本信息
  ticker VARCHAR(20) NOT NULL,
  side ENUM('LONG', 'SHORT') NOT NULL,
  size DECIMAL(20, 8) NOT NULL,
  
  -- 价格信息
  entry_price DECIMAL(20, 8) NOT NULL,
  close_price DECIMAL(20, 8) NULL,
  current_price DECIMAL(20, 8) NULL,
  
  -- 时间信息
  opened_at TIMESTAMP NOT NULL,
  closed_at TIMESTAMP NULL,
  
  -- 订单ID
  client_id BIGINT NOT NULL,
  
  -- 交易结果
  status ENUM('OPEN', 'CLOSED') DEFAULT 'OPEN',
  close_reason VARCHAR(100) NULL,
  pnl DECIMAL(20, 8) NULL,
  pnl_percent DECIMAL(10, 4) NULL,
  max_pnl_percent DECIMAL(10, 4) NULL,
  
  -- 信号分数
  signal_score DECIMAL(5, 4) NULL,
  
  -- 元数据
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- 索引
  INDEX idx_ticker (ticker),
  INDEX idx_status (status),
  INDEX idx_opened_at (opened_at),
  INDEX idx_closed_at (closed_at),
  INDEX idx_client_id (client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. 持仓均价表（当前持仓的成本计算）
CREATE TABLE IF NOT EXISTS position_cost_basis (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  
  ticker VARCHAR(20) NOT NULL UNIQUE,
  market VARCHAR(30) NOT NULL,
  
  -- 当前持仓
  current_size DECIMAL(20, 8) NOT NULL,
  current_side ENUM('LONG', 'SHORT') NOT NULL,
  
  -- 均价信息
  avg_entry_price DECIMAL(20, 8) NOT NULL,
  total_cost DECIMAL(20, 8) NOT NULL,
  
  -- 统计
  fill_count INT DEFAULT 0,
  first_fill_time TIMESTAMP NULL,
  last_fill_time TIMESTAMP NULL,
  
  -- 元数据
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_ticker (ticker)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. 扫描器状态表
CREATE TABLE IF NOT EXISTS scanner_state (
  id INT PRIMARY KEY DEFAULT 1,
  last_processed_height BIGINT NOT NULL DEFAULT 0,
  total_blocks_processed BIGINT NOT NULL DEFAULT 0,
  total_fills_found BIGINT NOT NULL DEFAULT 0,
  first_scan_at TIMESTAMP NULL,
  last_scan_at TIMESTAMP NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CHECK (id = 1)  -- 确保只有一行
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 插入初始状态
INSERT INTO scanner_state (id, last_processed_height, total_blocks_processed, total_fills_found)
VALUES (1, 0, 0, 0)
ON DUPLICATE KEY UPDATE id=id;

-- 创建视图：活跃持仓
CREATE OR REPLACE VIEW active_positions AS
SELECT 
  t.ticker,
  t.side,
  t.size,
  t.entry_price,
  t.opened_at,
  t.client_id,
  t.signal_score,
  pcb.avg_entry_price,
  pcb.fill_count
FROM trades t
LEFT JOIN position_cost_basis pcb ON t.ticker = pcb.ticker
WHERE t.status = 'OPEN'
ORDER BY t.opened_at DESC;

-- 创建视图：最近成交
CREATE OR REPLACE VIEW recent_fills AS
SELECT 
  f.ticker,
  f.market,
  f.side,
  f.size,
  f.price,
  f.block_time,
  f.height,
  f.client_id,
  f.source
FROM fills f
ORDER BY f.height DESC, f.id DESC
LIMIT 100;
