#!/usr/bin/env node

/**
 * 验证UI服务器的fills显示功能
 */

const axios = require('axios');

async function verifyUIFills() {
    console.log('🔍 验证UI Fills显示功能\n');
    console.log('='.repeat(60));
    
    try {
        // 1. 检查UI服务器
        console.log('\n1. 检查UI服务器状态...');
        const statusRes = await axios.get('http://localhost:3456/');
        console.log('   ✅ UI服务器运行正常');
        
        // 2. 检查fills API
        console.log('\n2. 检查 /api/fills 端点...');
        const fillsRes = await axios.get('http://localhost:3456/api/fills?limit=25');
        const fillsData = fillsRes.data;
        
        if (fillsData.success) {
            console.log(`   ✅ API返回成功: ${fillsData.fills.length} 条fills`);
            
            if (fillsData.fills.length > 0) {
                console.log('\n📋 Fills示例（前3条）:');
                fillsData.fills.slice(0, 3).forEach((fill, i) => {
                    console.log(`\n   ${i + 1}. ${fill.ticker} ${fill.side}`);
                    console.log(`      数量: ${fill.size}`);
                    console.log(`      价格: $${fill.price}`);
                    console.log(`      时间: ${new Date(fill.createdAt).toLocaleString('zh-CN')}`);
                });
            } else {
                console.log('\n   ⚠️  API返回0条fills（可能还在扫描中）');
            }
        } else {
            console.log('   ❌ API返回失败');
        }
        
        // 3. 检查持仓API
        console.log('\n3. 检查 /api/positions-with-avg 端点...');
        const posRes = await axios.get('http://localhost:3456/api/positions-with-avg');
        const posData = posRes.data;
        
        if (posData.success) {
            console.log(`   ✅ API返回成功: ${posData.positions.length} 个持仓`);
            
            if (posData.positions.length > 0) {
                console.log('\n📊 持仓示例:');
                posData.positions.forEach((pos, i) => {
                    console.log(`\n   ${i + 1}. ${pos.ticker} ${pos.side}`);
                    console.log(`      数量: ${pos.size}`);
                    console.log(`      均价: $${pos.avgEntryPrice}`);
                    console.log(`      P&L: $${pos.pnl} (${pos.pnlPercent}%)`);
                    if (pos.warning) {
                        console.log(`      ⚠️  ${pos.warning}`);
                    }
                });
            }
        }
        
        // 4. 检查UI HTML
        console.log('\n4. 检查UI HTML页面...');
        const htmlRes = await axios.get('http://localhost:3456/trading_ui_enhanced.html');
        const hasUpdateHistoryWithFills = htmlRes.data.includes('updateHistoryWithFills');
        const hasUpdatePositionsWithAvg = htmlRes.data.includes('updatePositionsWithAvg');
        
        console.log(`   ${hasUpdateHistoryWithFills ? '✅' : '❌'} updateHistoryWithFills 函数存在`);
        console.log(`   ${hasUpdatePositionsWithAvg ? '✅' : '❌'} updatePositionsWithAvg 函数存在`);
        
        // 总结
        console.log('\n' + '='.repeat(60));
        console.log('📊 验证结果总结:\n');
        
        if (fillsData.success && fillsData.fills.length > 0) {
            console.log('✅ UI服务器准备就绪');
            console.log(`✅ Fills API工作正常 (${fillsData.fills.length} 条)`);
            console.log('✅ UI能够显示fills数据');
            console.log('\n🎯 罗大爷可以访问UI查看！');
            console.log('   URL: http://localhost:3456/trading_ui_enhanced.html');
            console.log('   或: https://hawaii-pavilion-condo-dispatched.trycloudflare.com/trading_ui_enhanced.html');
        } else {
            console.log('⚠️  UI服务器运行正常');
            console.log('⚠️  但暂无fills数据（可能还在扫描）');
            console.log('\n💡 下一步:');
            console.log('   1. 等待区块扫描完成');
            console.log('   2. 或使用VPN访问Indexer获取历史fills');
        }
        
    } catch (error) {
        console.error('\n❌ 验证失败:', error.message);
        
        if (error.code === 'ECONNREFUSED') {
            console.log('\n💡 UI服务器未运行，需要启动:');
            console.log('   cd options-sentiment-engine && node trading_ui_server.js');
        }
    }
}

verifyUIFills().catch(console.error);
