#include <stdio.h>

int main(){
    unsigned long long num,minval=0;

    while(scanf("%llu" ,&num)==1){
        if(num>minval){
            minval=num;
        }
    }
    printf("%llu" ,minval);
}