#include <stdio.h>
#include <math.h>
int ngto(int a){
    if(a<2)return 0;
    for(int i=2;i<=sqrt(a);i++){
        if (a%i==0)return 0;
        }
        return 1;
}

int main(){
    int n,count=0,nu=2;
    scanf("%d",&n);
        while(count<n){
            if (ngto(nu)){
                printf("%d\n",nu);
                count++;
            }
            nu++;
    }

}