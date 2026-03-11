#include <stdio.h>

int main(){
    int n;
    scanf("%d",&n);
    for(int i=1;i<2*n;i+=2){
    
        for(int j=1;j<=i;j+=2){
                printf("%d",j);
        }
        for(int k=i-2;k>=1;k-=2){
            printf("%d",k);
    }
        printf("\n");
    }
   
}