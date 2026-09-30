import { network } from 'hardhat';
import { loadAndExecuteDeploymentsFromFiles } from '../../rocketh/environment.js';

// Single shared connection for the whole test run: the deployment fixture runs once
// and the rest of the test files restore its snapshot.
const connection = await network.create();

export const { ethers, networkHelpers, provider } = connection;

let currentEnv: any = null;

// hardhat-deploy v1 compatible surface used by the tests
export const deployments = {
  async get(name: string): Promise<{ address: string; abi: any }> {
    if (currentEnv === null) {
      throw new Error(`deployments.get('${name}') called before the deployment fixture was loaded`);
    }
    const deployment = currentEnv.get(name);
    return { address: ethers.getAddress(deployment.address), abi: deployment.abi };
  },
};

export const deployAll = async () => {
  currentEnv = await loadAndExecuteDeploymentsFromFiles({
    provider,
  });

  return currentEnv;
};
