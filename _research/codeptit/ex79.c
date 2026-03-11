#include <stdio.h>
#include <math.h>
int check(int a){
    int prev = 10; 
    while (a > 0){
        int digit = a % 10;
        if (digit > prev) return 0;
        prev = digit;
        a /= 10;
    }
    return 1;
}

int main(){
    int a,b;
    scanf("%d",&a);
    for(int k=0;k<a;k++){
        scanf("%d",&b);
        int nums=pow(10,b),numb=nums/10;
        for(int i=numb;i<nums;i++){
            if(check(i)){
                printf("%d ",i);
            }
        }
        printf("\n");
    }
}