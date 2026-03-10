#include <stdio.h>

int main(){
    unsigned int num,minval=0,maxval=1000000000;

    while(scanf("%u" ,&num)==1){
        if(num>minval){
            minval=num;
        }
        if(num<maxval){
            maxval=num;
        }
    }
    printf("%u %u" ,minval,maxval);
}