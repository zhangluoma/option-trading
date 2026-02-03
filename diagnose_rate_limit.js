#!/usr/bin/env node

/**
 * 诊断Rate Limit - 测试各个API的限制情况
 */

const axios = require('axios');

const VALIDATOR_REST = 'https://dydx-ops-rest.kingnodes.com';
const LATEST_HEIGHT = 74353744;

async function testAPI(name, url) {
    console.log(`\n📍 测试 ${name}:`);
    console.log(`   URL: ${url}`);
    
    const start = Date.now();
    
    try {
        const res = await axios.get(url, { timeout: 5000 });
        const duration = Date.now() - start;
        
        console.log(`   ✅ 成功! 响应时间: ${duration}ms`);
        console.log(`   状态码: ${res.status}`);
        return true;
    } catch (error) {
        const duration = Date.now() - start;
        console.log(`   ❌ 失败! 时间: ${duration}ms`);
        
        if (error.response) {
            console.log(`   状态码: ${error.response.status}`);
            console.log(`   错误: ${error.response.data?.message || error.response.statusText}`);
            
            if (error.response.status === 429) {
                console.log(`   🚫 Rate Limit: 被限流`);
            } else if (error.response.status === 403) {
                console.log(`   🚫 Forbidden: 被禁止访问`);
            }
        } else {
            console.log(`   错误: ${error.message}`);
        }
        
        return false;
    }
}

async function diagnoseRateLimit() {
    console.log('='.repeat(60));
    console.log('🔍 Rate Limit诊断 - 测试各个dYdX API');
    console.log('='.repeat(60));
    console.log(`节点: ${VALIDATOR_REST}\n`);
    
    const apis = [
        {
            name: '/blocks/latest (获取最新区块)',
            url: `${VALIDATOR_REST}/cosmos/base/tendermint/v1beta1/blocks/latest`
        },
        {
            name: `/blocks/${LATEST_HEIGHT} (获取指定区块)`,
            url: `${VALIDATOR_REST}/cosmos/base/tendermint/v1beta1/blocks/${LATEST_HEIGHT}`
        },
        {
            name: `/block_results/${LATEST_HEIGHT} (获取区块结果/事件) ⚠️ 这是问题API`,
            url: `${VALIDATOR_REST}/cosmos/base/tendermint/v1beta1/block_results/${LATEST_HEIGHT}`
        },
        {
            name: '/validatorsets/latest (获取验证者集)',
            url: `${VALIDATOR_REST}/cosmos/base/tendermint/v1beta1/validatorsets/latest`
        }
    ];
    
    const results = [];
    
    for (const api of apis) {
        const success = await testAPI(api.name, api.url);
        results.push({ name: api.name, success });
        
        // 间隔1秒避免连续请求
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // 连续快速请求测试
    console.log('\n' + '='.repeat(60));
    console.log('🚀 连续请求测试 - 测试Rate Limit触发');
    console.log('='.repeat(60));
    
    console.log('\n测试: 连续5次请求 block_results (无延迟)');
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 1; i <= 5; i++) {
        console.log(`\n   请求 ${i}/5:`);
        try {
            const start = Date.now();
            await axios.get(`${VALIDATOR_REST}/cosmos/base/tendermint/v1beta1/block_results/${LATEST_HEIGHT - i}`, 
                { timeout: 3000 });
            const duration = Date.now() - start;
            console.log(`   ✅ 成功 (${duration}ms)`);
            successCount++;
        } catch (error) {
            console.log(`   ❌ 失败: ${error.response?.status || error.message}`);
            
            if (error.response?.data) {
                const text = typeof error.response.data === 'string' 
                    ? error.response.data 
                    : JSON.stringify(error.response.data);
                
                if (text.includes('rate limit')) {
                    console.log(`   🚫 确认: Rate Limit!`);
                    console.log(`   详情: ${text.substring(0, 100)}`);
                }
            }
            
            failCount++;
        }
        
        // 不延迟，立即下一个请求
    }
    
    console.log(`\n结果: ${successCount} 成功, ${failCount} 失败`);
    
    // 总结
    console.log('\n' + '='.repeat(60));
    console.log('📊 诊断总结');
    console.log('='.repeat(60));
    
    const blockResultsAPI = results.find(r => r.name.includes('block_results'));
    
    if (blockResultsAPI && !blockResultsAPI.success) {
        console.log('\n🎯 问题API确认:');
        console.log('   API: /cosmos/base/tendermint/v1beta1/block_results/{height}');
        console.log('   用途: 获取区块事件日志（包含order fills等）');
        console.log('   问题: Rate Limit严格，连续请求会被限制');
        console.log('\n💡 解决方案:');
        console.log('   1. 增加延迟（目前200ms → 建议2000ms+）');
        console.log('   2. 使用其他节点轮换');
        console.log('   3. 不使用block_results，改用Protobuf解析交易');
        console.log('   4. 使用VPN访问Indexer API（最快）');
    }
    
    console.log();
}

diagnoseRateLimit().catch(console.error);
