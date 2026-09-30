import { deployScript, artifacts } from '../rocketh/deploy.js';

export default deployScript(
  async ({ deployViaProxy, execute, get, getOrNull, namedAccounts }) => {
    if (getOrNull('DaoStaking')) return;

    const { deployer } = namedAccounts;

    const addressBook = get('AddressBook');

    await deployViaProxy(
      'DaoStaking',
      {
        account: deployer,
        artifact: artifacts.DaoStaking,
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

    const daoStaking = get('DaoStaking');

    await execute(addressBook, {
      functionName: 'setDaoStaking',
      args: [daoStaking.address],
      account: deployer,
    });
  },
  { tags: ['DaoStaking'], dependencies: ['DaoToken'] },
);
