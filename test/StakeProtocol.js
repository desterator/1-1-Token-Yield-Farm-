const StakeProtocol = artifacts.require("StakeProtocol");
const Token = artifacts.require("./Test/Token");

const Reverter = require("./helpers/reverter");
const setCurrentTime = require('./helpers/ganacheTimeTraveler');

const truffleAssert = require("truffle-assertions");
const BigNumber = require('bignumber.js');
const toBN = (num) => {
  return new BigNumber(num);
};

contract("StakeProtocol", async (accounts) => {
  const reverter = new Reverter(web3);

  const DEFAULT = accounts[0];

  let safemoonCash;
  let smCGov;
  let stakeProtocol;


  before("setup", async () => {
    safemoonCash = await Token.new();
    smCGov = await Token.new();

    await safemoonCash.mint(DEFAULT, "100000000000000");
    assert.equal("100000000000000", await safemoonCash.balanceOf(DEFAULT));

    stakeProtocol = await StakeProtocol.new(safemoonCash.address, smCGov.address);

    await safemoonCash.approve(stakeProtocol.address, "100000000000000");
    await smCGov.mint(stakeProtocol.address, "100000000000000");
    assert.equal("100000000000000", await smCGov.balanceOf(stakeProtocol.address));

    await reverter.snapshot();
  });

  afterEach("revert", reverter.revert);

  describe("stake", async () => {
    it("should stake amount, happy path", async () => {
      const amount = toBN(20);
      const defaultBalanceBeforeStake = await safemoonCash.balanceOf(DEFAULT);
      const protocolBalanceBeforeStake = await safemoonCash.balanceOf(stakeProtocol.address);

      setCurrentTime(1);
      const tx = await stakeProtocol.stake(amount);
      const stake = await stakeProtocol.stakes(DEFAULT)

      assert.equal(amount, (stake.amount).toString());
      assert.equal(1, stake.timestamp);
      assert.equal(toBN(defaultBalanceBeforeStake).minus(amount), (await safemoonCash.balanceOf(DEFAULT)).toString());
      assert.equal(amount.plus(protocolBalanceBeforeStake), (await safemoonCash.balanceOf(stakeProtocol.address)).toString());
      assert.equal(DEFAULT, tx.logs[0].args.user);
      assert.equal(amount, (tx.logs[0].args.amount).toString());
    });
    it("should get reward from previous period", async () => {
      const amount = toBN("5000000000");
      const defaultBalanceBeforeStake = await safemoonCash.balanceOf(DEFAULT);
      const protocolBalanceBeforeStake = await safemoonCash.balanceOf(stakeProtocol.address);

      setCurrentTime(1);
      let tx = await stakeProtocol.stake(amount);
      let stake = await stakeProtocol.stakes(DEFAULT);

      assert.equal(amount, (stake.amount).toString());
      assert.equal(1, stake.timestamp);
      assert.equal(toBN(defaultBalanceBeforeStake).minus(amount), (await safemoonCash.balanceOf(DEFAULT)).toString());
      assert.equal(amount.plus(protocolBalanceBeforeStake), (await safemoonCash.balanceOf(stakeProtocol.address)).toString());
      assert.equal(DEFAULT, tx.logs[0].args.user);
      assert.equal(amount, (tx.logs[0].args.amount).toString());

      setCurrentTime(101);
      // must be 5787037 because 100 * 5000000000 / 86400
      const reward = 5787037;
      assert.equal(reward, await stakeProtocol.stakerReward(DEFAULT));

      const additional = toBN(1);
      const defaultBalanceBeforeSecondStake = await safemoonCash.balanceOf(DEFAULT);
      const protocolBalanceBeforeSecondStake = await safemoonCash.balanceOf(stakeProtocol.address);
      const defaultSmCGovBalanceBeforeSecondStake = await smCGov.balanceOf(DEFAULT);
      const protocolSmCGovBalanceBeforeSecondStake = await smCGov.balanceOf(stakeProtocol.address);

      tx = await stakeProtocol.stake(additional);
      stake = await stakeProtocol.stakes(DEFAULT);

      assert.equal(amount.plus(additional), (stake.amount).toString());
      assert.equal(101, stake.timestamp);
      assert.equal(0, await stakeProtocol.stakerReward(DEFAULT));
      assert.equal(toBN(defaultBalanceBeforeSecondStake).minus(additional),  (await safemoonCash.balanceOf(DEFAULT)).toString());
      assert.equal(additional.plus(protocolBalanceBeforeSecondStake), (await safemoonCash.balanceOf(stakeProtocol.address)).toString());
      assert.equal(toBN(defaultSmCGovBalanceBeforeSecondStake).plus(reward), (await smCGov.balanceOf(DEFAULT)).toString());
      assert.equal(toBN(protocolSmCGovBalanceBeforeSecondStake).minus(reward), (await smCGov.balanceOf(stakeProtocol.address)).toString());
      assert.equal(DEFAULT, tx.logs[0].args.user);
      assert.equal(reward, (tx.logs[0].args.amount).toString());
      assert.equal(DEFAULT, tx.logs[1].args.user);
      assert.equal(additional, (tx.logs[1].args.amount).toString());
    });
    it("should get exception, stake 0 amount", async () => {
      await truffleAssert.reverts(stakeProtocol.stake(0), "InvalidAmount");
    });
  });
  describe("unstake", async () => {
    it("should unstake after stake and don't get reward, like do it in one timestamp", async () => {
      setCurrentTime(1);
      const amount = toBN(100);
      await stakeProtocol.stake(amount);

      const defaultBalanceBeforeUnstake = await safemoonCash.balanceOf(DEFAULT);
      const protocolBalanceBeforeUnstake = await safemoonCash.balanceOf(stakeProtocol.address);
      const defaultSmCGovBalanceBeforeUnstake = await smCGov.balanceOf(DEFAULT);
      const protocolSmCGovBalanceBeforeUnstake = await smCGov.balanceOf(stakeProtocol.address);
      assert.equal(0, await stakeProtocol.stakerReward(DEFAULT));

      const tx = await stakeProtocol.unstake(amount)
      const stake = await stakeProtocol.stakes(DEFAULT);

      assert.equal(0, (stake.amount).toString());
      assert.equal(1, (stake.timestamp).toString());
      assert.equal(amount.plus(defaultBalanceBeforeUnstake), (await safemoonCash.balanceOf(DEFAULT)).toString());
      assert.equal(toBN(protocolBalanceBeforeUnstake).minus(amount), (await safemoonCash.balanceOf(stakeProtocol.address)).toString());
      assert.equal(defaultSmCGovBalanceBeforeUnstake.toString(), (await smCGov.balanceOf(DEFAULT)).toString());
      assert.equal(protocolSmCGovBalanceBeforeUnstake.toString(), (await smCGov.balanceOf(stakeProtocol.address)).toString());
      assert.equal(DEFAULT, tx.logs[0].args.user);
      assert.equal(amount, (tx.logs[0].args.amount).toString());
    });
    it("should unstake 30% after stake and don't get reward, like do it in one timestamp", async () => {
      setCurrentTime(1);
      const stakeAmount = toBN(100);
      const unstakeAmount = toBN(30);
      await stakeProtocol.stake(stakeAmount);

      const defaultBalanceBeforeUnstake = await safemoonCash.balanceOf(DEFAULT);
      const protocolBalanceBeforeUnstake = await safemoonCash.balanceOf(stakeProtocol.address);
      const defaultSmCGovBalanceBeforeUnstake = await smCGov.balanceOf(DEFAULT);
      const protocolSmCGovBalanceBeforeUnstake = await smCGov.balanceOf(stakeProtocol.address);
      assert.equal(0, await stakeProtocol.stakerReward(DEFAULT));

      const tx = await stakeProtocol.unstake(unstakeAmount)
      const stake = await stakeProtocol.stakes(DEFAULT);

      assert.equal(stakeAmount.minus(unstakeAmount), (stake.amount).toString());
      assert.equal(1, (stake.timestamp).toString());
      assert.equal(unstakeAmount.plus(defaultBalanceBeforeUnstake), (await safemoonCash.balanceOf(DEFAULT)).toString());
      assert.equal(toBN(protocolBalanceBeforeUnstake).minus(unstakeAmount), (await safemoonCash.balanceOf(stakeProtocol.address)).toString());
      assert.equal(defaultSmCGovBalanceBeforeUnstake.toString(), (await smCGov.balanceOf(DEFAULT)).toString());
      assert.equal(protocolSmCGovBalanceBeforeUnstake.toString(), (await smCGov.balanceOf(stakeProtocol.address)).toString());
      assert.equal(DEFAULT, tx.logs[0].args.user);
      assert.equal(unstakeAmount, (tx.logs[0].args.amount).toString());
    });
    it("should unstake after stake and get reward", async () => {
      setCurrentTime(100);
      const amount = toBN("48388328");
      await stakeProtocol.stake(amount);

      const defaultBalanceBeforeUnstake = await safemoonCash.balanceOf(DEFAULT);
      const protocolBalanceBeforeUnstake = await safemoonCash.balanceOf(stakeProtocol.address);
      const defaultSmCGovBalanceBeforeUnstake = await smCGov.balanceOf(DEFAULT);
      const protocolSmCGovBalanceBeforeUnstake = await smCGov.balanceOf(stakeProtocol.address);

      setCurrentTime(6425);
      const reward = 3542316;
      assert.equal(reward, (await stakeProtocol.stakerReward(DEFAULT)).toString());

      const tx = await stakeProtocol.unstake(amount)
      const stake = await stakeProtocol.stakes(DEFAULT);

      assert.equal(0, (stake.amount).toString());
      assert.equal(6425, (stake.timestamp).toString());
      assert.equal(0, (await stakeProtocol.stakerReward(DEFAULT)).toString());
      assert.equal(amount.plus(defaultBalanceBeforeUnstake), (await safemoonCash.balanceOf(DEFAULT)).toString());
      assert.equal(toBN(protocolBalanceBeforeUnstake).minus(amount), (await safemoonCash.balanceOf(stakeProtocol.address)).toString());
      assert.equal(toBN(defaultSmCGovBalanceBeforeUnstake).plus(reward), (await smCGov.balanceOf(DEFAULT)).toString());
      assert.equal(toBN(protocolSmCGovBalanceBeforeUnstake).minus(reward), (await smCGov.balanceOf(stakeProtocol.address)).toString());
      assert.equal(DEFAULT, tx.logs[0].args.user);
      assert.equal(reward, (tx.logs[0].args.amount).toString());
      assert.equal(DEFAULT, tx.logs[1].args.user);
      assert.equal(amount, (tx.logs[1].args.amount).toString());
    });
    it("should unstake 30% after stake and get reward, then should get reward for next period with 70% stake", async () => {
      setCurrentTime(1);
      const stakeAmount = toBN(100);
      const unstakeAmount = toBN(30);
      await stakeProtocol.stake(stakeAmount);

      const defaultBalanceBeforeUnstake = await safemoonCash.balanceOf(DEFAULT);
      const protocolBalanceBeforeUnstake = await safemoonCash.balanceOf(stakeProtocol.address);
      const defaultSmCGovBalanceBeforeUnstake = await smCGov.balanceOf(DEFAULT);
      const protocolSmCGovBalanceBeforeUnstake = await smCGov.balanceOf(stakeProtocol.address);

      setCurrentTime(19358);
      let reward = 22;
      assert.equal(reward, await stakeProtocol.stakerReward(DEFAULT));

      let tx = await stakeProtocol.unstake(unstakeAmount)
      let stake = await stakeProtocol.stakes(DEFAULT);

      assert.equal(stakeAmount.minus(unstakeAmount), (stake.amount).toString());
      assert.equal(19358, (stake.timestamp).toString());
      assert.equal(0, await stakeProtocol.stakerReward(DEFAULT));
      assert.equal(unstakeAmount.plus(defaultBalanceBeforeUnstake), (await safemoonCash.balanceOf(DEFAULT)).toString());
      assert.equal(toBN(protocolBalanceBeforeUnstake).minus(unstakeAmount), (await safemoonCash.balanceOf(stakeProtocol.address)).toString());
      assert.equal(toBN(defaultSmCGovBalanceBeforeUnstake).plus(reward), (await smCGov.balanceOf(DEFAULT)).toString());
      assert.equal(toBN(protocolSmCGovBalanceBeforeUnstake).minus(reward), (await smCGov.balanceOf(stakeProtocol.address)).toString());
      assert.equal(DEFAULT, tx.logs[0].args.user);
      assert.equal(reward, (tx.logs[0].args.amount).toString());
      assert.equal(DEFAULT, tx.logs[1].args.user);
      assert.equal(unstakeAmount, (tx.logs[1].args.amount).toString());

      setCurrentTime(68000);
      reward = 39;
      assert.equal(reward, (await stakeProtocol.stakerReward(DEFAULT)).toString());

      const remainder = stakeAmount.minus(unstakeAmount);
      const defaultBalanceBeforeSecondUnstake = await safemoonCash.balanceOf(DEFAULT);
      const protocolBalanceBeforeSecondUnstake = await safemoonCash.balanceOf(stakeProtocol.address);
      const defaultSmCGovBalanceBeforeSecondUnstake = await smCGov.balanceOf(DEFAULT);
      const protocolSmCGovBalanceBeforeSecondUnstake = await smCGov.balanceOf(stakeProtocol.address);

      tx = await stakeProtocol.unstake(remainder);
      stake = await stakeProtocol.stakes(DEFAULT);
      assert.equal(0, (stake.amount).toString());
      assert.equal(68000, (stake.timestamp).toString());
      assert.equal(0, await stakeProtocol.stakerReward(DEFAULT));
      assert.equal(remainder.plus(defaultBalanceBeforeSecondUnstake), (await safemoonCash.balanceOf(DEFAULT)).toString());
      assert.equal(toBN(protocolBalanceBeforeSecondUnstake).minus(remainder), (await safemoonCash.balanceOf(stakeProtocol.address)).toString());
      assert.equal(toBN(defaultSmCGovBalanceBeforeSecondUnstake).plus(reward), (await smCGov.balanceOf(DEFAULT)).toString());
      assert.equal(toBN(protocolSmCGovBalanceBeforeSecondUnstake).minus(reward), (await smCGov.balanceOf(stakeProtocol.address)).toString());
      assert.equal(DEFAULT, tx.logs[0].args.user);
      assert.equal(reward, (tx.logs[0].args.amount).toString());
      assert.equal(DEFAULT, tx.logs[1].args.user);
      assert.equal(remainder, (tx.logs[1].args.amount).toString());
    });
    it("should get exception, unstake 0 amount", async () => {
      await truffleAssert.reverts(stakeProtocol.unstake(0), "InvalidAmount");
    });
  });
});