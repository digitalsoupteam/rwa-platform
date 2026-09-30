import { deployScript, artifacts } from '../rocketh/deploy.js';

export default deployScript(
  async ({ deployViaProxy, execute, get, getOrNull, namedAccounts }) => {
    if (getOrNull('ReferralTreasury')) return;

    const { deployer } = namedAccounts;

    const addressBook = get('AddressBook');

    await deployViaProxy(
      'ReferralTreasury',
      {
        account: deployer,
        artifact: artifacts.ReferralTreasury,
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

    const referralTreasury = get('ReferralTreasury');

    await execute(addressBook, {
      functionName: 'setReferralTreasury',
      args: [referralTreasury.address],
      account: deployer,
    });
  },
  { tags: ['ReferralTreasury'], dependencies: ['PlatformToken'] },
);
