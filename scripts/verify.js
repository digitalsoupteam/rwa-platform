const fs = require('fs');
const path = require('path');
const https = require('https');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function sendRequest(apiUrl, postData) {
    return new Promise((resolve, reject) => {
        const url = new URL(apiUrl);
        const options = {
            method: 'POST',
            hostname: url.hostname,
            path: url.pathname + url.search,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve({ status: '0', result: data });
                }
            });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

async function verifyOne(contractName, network, apiKey, apiUrl, customArgs, chainId) {
    const deploymentPath = path.join(process.cwd(), 'deployments', network, `${contractName}.json`);
    if (!fs.existsSync(deploymentPath)) return { success: false, error: 'File not found' };

    const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    if (!deployment.solcInputHash) return { success: false, error: 'No solcInputHash found' };

    const solcInputPath = path.join(process.cwd(), 'deployments', network, 'solcInputs', `${deployment.solcInputHash}.json`);
    if (!fs.existsSync(solcInputPath)) return { success: false, error: 'Solc input file not found' };

    const solcInput = fs.readFileSync(solcInputPath, 'utf8');
    const metadata = JSON.parse(deployment.metadata);
    const compilationTarget = metadata.settings.compilationTarget;
    const contractPath = Object.keys(compilationTarget)[0];
    const contractClassName = compilationTarget[contractPath];

    const bodyParams = {
        apikey: apiKey,
        module: 'contract',
        action: 'verifysourcecode',
        contractaddress: deployment.address,
        sourceCode: solcInput,
        codeformat: 'solidity-standard-json-input',
        contractname: `${contractPath}:${contractClassName}`,
        compilerversion: `v${metadata.compiler.version}`,
        optimizationUsed: metadata.settings.optimizer.enabled ? 1 : 0,
        runs: metadata.settings.optimizer.runs,
        constructorArguements: (customArgs || "").replace('0x', ''),
        evmversion: metadata.settings.evmVersion || '',
    };

    const finalUrl = `${apiUrl}?chainid=${chainId}`;
    const postData = new URLSearchParams(bodyParams).toString();

    console.log(`-> Submitting ${contractName} (${deployment.address})`);
    console.log(`   URL: ${finalUrl}`);
    
    try {
        const response = await sendRequest(finalUrl, postData);
        return { success: response.status === '1', result: response.result };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function main() {
    const args = process.argv.slice(2);
    const params = {};
    args.forEach(arg => {
        if (arg.startsWith('--')) {
            const [key, value] = arg.split('=');
            params[key.slice(2)] = value;
        }
    });

    const network = params.network || 'bscTestnet';
    const apiKey = params.apikey;
    const apiUrl = params.url || 'https://api.etherscan.io/v2/api';
    
    if (!apiKey) {
        console.log("Manual Verify Script (V2 API)");
        console.log("Usage: node scripts/verify.js --apikey=KEY [--contract=Name] [--chainid=ID]");
        return;
    }

    let chainId = params.chainid;
    if (!chainId) {
        const chainIdPath = path.join(process.cwd(), 'deployments', network, '.chainId');
        if (fs.existsSync(chainIdPath)) {
            chainId = fs.readFileSync(chainIdPath, 'utf8').trim();
        }
    }
    
    if (!chainId) {
        console.error("Error: chainid not found. Provide it via --chainid=ID");
        return;
    }

    if (params.contract) {
        const res = await verifyOne(params.contract, network, apiKey, apiUrl, params.args, chainId);
        if (res.success) {
            console.log(`SUCCESS: GUID ${res.result}`);
        } else {
            console.log(`FAILED: ${res.result || res.error}`);
        }
    } else {
        const dir = path.join(process.cwd(), 'deployments', network);
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('.'));
        console.log(`Found ${files.length} contracts in ${network}. Batch verifying...`);
        
        for (const file of files) {
            const name = path.basename(file, '.json');
            if (name === '.chainId' || name === 'solcInputs') continue;
            
            const res = await verifyOne(name, network, apiKey, apiUrl, null, chainId);
            if (res.success) {
                console.log(`OK: ${name}. GUID: ${res.result}`);
                await sleep(5000);
            } else if (res.error !== 'No solcInputHash found') {
                console.log(`FAIL: ${name}. Reason: ${res.result || res.error}`);
                await sleep(5000);
            }
        }
    }
}

main().catch(console.error);
