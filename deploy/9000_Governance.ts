import { deployScript, artifacts } from '../rocketh/deploy.js';

export default deployScript(
  async ({ deployViaProxy, execute, get, getOrNull, namedAccounts }) => {
    if (getOrNull('Governance')) return;

    const { deployer } = namedAccounts;

    const addressBook = get('AddressBook');

    await deployViaProxy(
      'Governance',
      {
        account: deployer,
        artifact: artifacts.Governance,
        args: [],
      },
      {
        proxyContract: 'UUPS',
        execute: {
          methodName: 'initialize',
          args: [addressBook.address],
        },
      },
    );

    const governance = get('Governance');

    await execute(addressBook, {
      functionName: 'setGovernance',
      args: [governance.address],
      account: deployer,
    });
  },
  { tags: ['Governance'], dependencies: ['Factory'] },
);
