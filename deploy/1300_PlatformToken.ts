import { deployScript, artifacts } from '../rocketh/deploy.js';

export default deployScript(
  async ({ deployViaProxy, execute, get, getOrNull, namedAccounts }) => {
    if (getOrNull('PlatformToken')) return;

    const { deployer } = namedAccounts;

    const addressBook = get('AddressBook');

    await deployViaProxy(
      'PlatformToken',
      {
        account: deployer,
        artifact: artifacts.PlatformToken,
        args: [],
      },
      {
        proxyContract: 'UUPS',
        execute: {
          methodName: 'initialize',
          args: [
            addressBook.address, // initialAddressBook
            'RWA_PLATFORM', // initialName
            'RWAP', // initialSymbol
          ],
        },
      },
    );

    const platformToken = get('PlatformToken');

    await execute(addressBook, {
      functionName: 'setPlatformToken',
      args: [platformToken.address],
      account: deployer,
    });

    await execute(platformToken, {
      functionName: 'mint',
      args: [[deployer], [10n ** 18n * 21000000n]], // holders, amounts
      account: deployer,
    });
  },
  { tags: ['PlatformToken'], dependencies: ['EventEmitter'] },
);
