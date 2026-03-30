/*Write a function to list all **Super Primes** less than N.
A Super Prime is a prime number such that when you repeatedly delete its last digit, the remaining number is also prime (e.g., 373 -> 37 -> 3, all prime).

- **Input**: Integer N (N < 100000).
- **Output**: Space-separated list of Super Primes < N.
- **Test Cases**: Run against 5 inputs.
- **Example**:
  - Input: `50`
  - Output: `2 3 5 7 23 29 31 37`*/


#include <stdio.h>
#include <stdbool.h>
#include <math.h>

bool prime(int n){
    if(n<2) return 0;
    for(int i=2;i<=sqrt(n);i++){
        if(n%i==0)return 0;
    }
    return 1;
}
bool digit(int n){
    if(n<2)return 0;
    while(n>0){
        if(prime(n)){
            n/=10;
        }
        else return 0;
    }
    return 1;
}
int main(){
 int t; scanf("%d",&t);
    for(int i=0;i<t;i++){
        if(digit(i)){
            printf("%d ",i );
        }
    }
}
