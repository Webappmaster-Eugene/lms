package main

import (
  "encoding/json"
  "os"
  "slices"
)

func main() {
  var words []string
  if err := json.NewDecoder(os.Stdin).Decode(&words); err != nil { panic(err) }
  unique := []string{}
  for _, word := range words {
    if !slices.Contains(unique, word) { unique = append(unique, word) }
  }
  json.NewEncoder(os.Stdout).Encode(unique)
}
