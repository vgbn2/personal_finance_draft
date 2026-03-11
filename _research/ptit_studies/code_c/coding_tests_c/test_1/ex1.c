/**
 * sumodigi=sumodigi(of prime factors){
 * requitre:prime check for prime factor
 * sum of digit function(done)
* factor functio-can group with prime check)
 *then check if sum of digit==sum of digit of prime factors
 */

#include <stdio.h>
#include <stdbool.h>
#include <math.h>

int sumodigit(int n){
    int sum=0;
    while(n>0){
        sum+=n%10;
        n/=10;
    }
    return sum;
}
// 2. Sum of digits of prime factors
int sumoprimefactor(int n){
    int sum = 0;
    for (int i = 2; i <=sqrt(n); i++) {
        while (n % i == 0) {
            sum += sumodigit(i);
            n /= i;
        }
    }
    if (n > 1) {
        sum += sumodigit(n);
    }
    return sum;
}

bool is_smith(int n){
   // Smith numbers are composite. Primes are excluded.
   if (ktnt(n)) return false;
   return sumodigit(n) == sumoprimefactor(n);
}

int main(){
    int n;
    scanf("%d", &n);
    // Print all Smith numbers less than n
    for(int i = 4; i < n; i++){
        if(is_smith(i)){
            printf("%d ", i);
        }
    }
    return 0;
}