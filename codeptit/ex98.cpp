#include <stdio.h>
#include <math.h>

long long giaithua(int a){
    long long tich=1;
    for(int i=1;i<=a;i++){
        tich*=i;
    }
    return tich;
}

int main(){
    int a,b;
    scanf("%d %d",&a,&b);
    if(giaithua(a)%(long long)pow(2,b)==0){
        printf("YES");
    }
    else printf("NO");
    printf("\n");
}