/*
 * This is an example of an AssemblyScript smart contract with two simple,
 * symmetric functions:
 *
 * 1. setGreeting: accepts a greeting, such as "howdy", and records it for the
 *    user (account_id) who sent the request
 * 2. getGreeting: accepts an account_id and returns the greeting saved for it,
 *    defaulting to "Hello"
 *
 * Learn more about writing NEAR smart contracts with AssemblyScript:
 * https://docs.near.org/docs/roles/developer/contracts/assemblyscript
 *
 */

import { Context, logging, storage, ContractPromiseBatch, u128, base58, util } from 'near-sdk-as'

// TODO: Fix senderPublicKey (probably have either to deprecate or return raw buffer),
// as this string representation not used anywhere (has extra byte in front)
let _public_key: string | null = null
function getPublicKey(): string {
  if (!_public_key) {
    _public_key = base58.encode(base58.decode(Context.senderPublicKey).subarray(1));
  }
  return _public_key!;
}

export function claim(account_id: string): ContractPromiseBatch {
  requireSelf();
  const tokens = getTokens(getPublicKey());

  const promise = ContractPromiseBatch.create(Context.contractName)
    .delete_key(base58.decode(getPublicKey()))
    .then(account_id)
    .transfer(tokens);
  addTransactions(promise, account_id);
  removeDropInfo();

  return promise;
}

function getTokens(publicKey: string): u128 {
  return storage.getSome<u128>(`tokens:${publicKey}`);
}

function removeDropInfo(): void {
  storage.delete(`tokens:${getPublicKey()}`);
  storage.delete(`txs:${getPublicKey()}`);
}

function addTransactions(promise: ContractPromiseBatch, account_id: string): void {
  const transactions = storage.getSome<TransactionRequest[]>(`txs:${getPublicKey()}`);
  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    promise = promise.then(tx.receiver_id);
    
    for (let j = 0; j < tx.actions.length; j++) {
      const action = tx.actions[j];
      if (action.method_name) {
        const args = action.args.replaceAll('%%RECEIVER_ID%%', account_id);
        promise.function_call(action.method_name, util.stringToBytes(args), action.deposit, action.gas);
      } else {
        promise.transfer(action.deposit);
      }
    };
  };
}

const ACCOUNT_CREATOR_ID = 'testnet';
const CREATE_ACCOUNT_GAS: u64 = 50_000_000_000_000;

@nearBindgen
class CreateAccountArgs {
  new_account_id: string;
  new_public_key: string;
}

export function create_account_and_claim(new_account_id: string, new_public_key: string): ContractPromiseBatch {
  requireSelf();
  const tokens = getTokens(getPublicKey());

  const promise = ContractPromiseBatch.create(ACCOUNT_CREATOR_ID)
    .function_call<CreateAccountArgs>('create_account', { new_account_id, new_public_key }, tokens, CREATE_ACCOUNT_GAS)
    .then(Context.contractName)
    .delete_key(base58.decode(getPublicKey()))
  // TODO: How to handle create_account failure?
  addTransactions(promise, new_account_id);
  removeDropInfo();

  return promise;
}

export function get_key_balance(key: string): u128 {
  return getTokens(key.replace('ed25519:', ''));
}


@nearBindgen
class Action {
  method_name: string;
  args: string;
  deposit: u128 = u128.Zero;
  gas: u64;
}

@nearBindgen
class TransactionRequest {
  receiver_id: string
  actions: Action[];
}

function requireSelf(): void {
  assert(Context.contractName == Context.predecessor, 'can only be called by self');
}

export function send_with_transactions(public_key: string, tokens: u128, transactions: TransactionRequest[]): void {
  requireSelf();

  storage.set(`tokens:${public_key}`, tokens);
  storage.set(`txs:${public_key}`, transactions);
}