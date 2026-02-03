#!/usr/bin/env node

const axios = require('axios');

const NODES = [
    'https://dydx-ops-rest.kingnodes.com',
    'https://dydx-rest.publicnode.com',
    'https://dydx-dao-api.polkachu.com',
    'https://dydx-mainnet-lcd.autostake.com',
];

const LATEST_HEIGHT = 74353744;

async function testNode(nodeUrl) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`测试节点: ${nodeUrl}`);
    console.log('='.repeat(60));
    
    // 测试blocks
    try {
        const res = await axios.get(`${nodeUrl}/cosmos/base/tendermint/v1beta1/blocks/latest`, 
            { timeout: 5000 });
        console.log(`✅ /blocks/latest: OK (${res.status})`);
    } catch (e) {
        console.log(`❌ /blocks/latest: ${e.response?.status || e.message}`);
    }
    
    // 测试block_results
    try {
        const res = await axios.get(`${nodeUrl}/cosmos/base/tendermint/v1beta1/block_results/${LATEST_HEIGHT}`, 
            { timeout: 5000 });
        console.log(`✅ /block_results/${LATEST_HEIGHT}: OK (${res.status})`);
        console.log(`   🎉 这个节点支持block_results！`);
        return true;
    } catch (e) {
        const status = e.response?.status;
        console.log(`❌ /block_results/${LATEST_HEIGHT}: ${status || e.message}`);
        
        if (status === 501) {
            console.log(`   ⚠️  501 Not Implemented - 节点不支持此API`);
        } else if (status === 429) {
            console.log(`   ⚠️  429 Rate Limited - 被限流`);
        }
        return false;
    }
}

async function main() {
    console.log('🔍 测试不同dYdX节点的block_results支持\n');
    
    const workingNodes = [];
    
    for (const node of NODES) {
        const works = await testNode(node);
        if (works) {
            workingNodes.push(node);
        }
        await new Promise(r => setTimeout(r, 2000));
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log('📊 总结');
    console.log('='.repeat(60));
    
    if (workingNodes.length > 0) {
        console.log(`\n✅ 找到 ${workingNodes.length} 个支持block_results的节点:\n`);
        workingNodes.forEach(node => {
            console.log(`   ${node}`);
        });
        console.log(`\n💡 建议: 使用这些节点扫描区块事件`);
    } else {
        console.log('\n❌ 所有测试的节点都不支持block_results API');
        console.log('\n💡 这意味着:');
        console.log('   1. block_results可能是过时的API');
        console.log('   2. 或者只有官方节点支持');
        console.log('   3. 需要使用其他方法（Protobuf解析交易）');
    }
}

main().catch(console.error);
