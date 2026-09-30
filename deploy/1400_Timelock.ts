import { deployScript, artifacts } from '../rocketh/deploy.js';

export default deployScript(
  async ({ deployViaProxy, execute, get, getOrNull, namedAccounts }) => {
    if (getOrNull('Timelock')) return;

    const { deployer } = namedAccounts;

    const addressBook = get('AddressBook');

    await deployViaProxy(
      'Timelock',
      {
        account: deployer,
        artifact: artifacts.Timelock,
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

    const timelock = get('Timelock');

    await execute(addressBook, {
      functionName: 'setTimelock',
      args: [timelock.address],
      account: deployer,
    });
  },
  { tags: ['Timelock'], dependencies: ['DaoStaking'] },
);
