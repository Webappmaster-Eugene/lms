package main

import (
  "encoding/json"
  "os"
  "sort"
)

type Operation struct { Kind, User, From, To string; Amount int64 }
type Account struct { User string `json:"user"`; Balance int64 `json:"balance"` }
type Result struct { Status string `json:"status"`; Balance *int64 `json:"balance,omitempty"` }
type Output struct { Balances []Account `json:"balances"`; Results []Result `json:"results"` }
type Ledger []Account

func (ledger *Ledger) position(user string) int {
  return sort.Search(len(*ledger), func(i int) bool { return (*ledger)[i].User >= user })
}

func (ledger *Ledger) balance(user string) int64 {
  index := ledger.position(user)
  if index < len(*ledger) && (*ledger)[index].User == user { return (*ledger)[index].Balance }
  return 0
}

func (ledger *Ledger) add(user string, delta int64) {
  index := ledger.position(user)
  if index == len(*ledger) || (*ledger)[index].User != user {
    *ledger = append(*ledger, Account{})
    copy((*ledger)[index + 1:], (*ledger)[index:])
    (*ledger)[index] = Account{User: user}
  }
  (*ledger)[index].Balance += delta
}

func main() {
  var input struct { Operations []Operation }
  if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil { panic(err) }
  ledger := Ledger{}
  results := []Result{}
  for _, operation := range input.Operations {
    result := Result{Status: "invalid"}
    if operation.Kind == "balance" && operation.User != "" {
      value := ledger.balance(operation.User)
      result = Result{Status: "ok", Balance: &value}
    } else if operation.Amount > 0 {
      from, to := "", ""
      switch operation.Kind {
      case "credit": to = operation.User
      case "debit": from = operation.User
      case "transfer": from, to = operation.From, operation.To
      }
      valid := (operation.Kind == "credit" && to != "") ||
        (operation.Kind == "debit" && from != "") ||
        (operation.Kind == "transfer" && from != "" && to != "" && from != to)
      if valid {
        result.Status = "ok"
        if from != "" && ledger.balance(from) < operation.Amount {
          result.Status = "insufficient"
        } else {
          if from != "" { ledger.add(from, -operation.Amount) }
          if to != "" { ledger.add(to, operation.Amount) }
        }
      }
    }
    results = append(results, result)
  }
  json.NewEncoder(os.Stdout).Encode(Output{[]Account(ledger), results})
}
