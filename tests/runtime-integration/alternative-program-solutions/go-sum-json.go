package main

import (
  "encoding/json"
  "fmt"
  "os"
)

func main() {
  decoder := json.NewDecoder(os.Stdin)
  decoder.UseNumber()
  decoder.Token()
  var total int64
  for decoder.More() {
    token, err := decoder.Token()
    if err != nil { panic(err) }
    value, err := token.(json.Number).Int64()
    if err != nil { panic(err) }
    total += value
  }
  fmt.Println(total)
}
